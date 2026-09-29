# -*- coding: utf-8 -*-
"""건물 클릭 레이어(지시서 8장) 산출물 점검. 원천(상가정보 CSV·WFS 캐시)은 커밋하지 않으므로 커밋된 public/data/buildings만 본다."""
import json
import math
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "buildings"
CFG = json.loads((ROOT / "data" / "config" / "buildings.json").read_text(encoding="utf-8"))
AIRPORTS = json.loads((ROOT / "data" / "config" / "airports.json").read_text(encoding="utf-8"))
INDEX = json.loads((OUT / "index.json").read_text(encoding="utf-8"))

# 건물 속성은 이것뿐이다. 건물별 외국인 방문·소비 값은 없으므로 만들지 않는다
ALLOWED = {"id", "k", "use", "fl", "yr", "nm", "n", "shops", "km", "cy", "cx"}


def haversine(lat1, lng1, lat2, lng2):
    r, p = 6371.0088, math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def rings(geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for poly in polys:
        yield from poly


@pytest.fixture(scope="module")
def areas():
    return {a["cd"]: json.loads((OUT / a["file"]).read_text(encoding="utf-8")) for a in INDEX["areas"]}


def test_index_matches_config(areas):
    assert INDEX["protect_km"] == CFG["protect_km"] == 3
    assert INDEX["min_shops"] == CFG["min_shops"] == 3
    assert [a["cd"] for a in INDEX["areas"]] == [s["cd"] for s in CFG["scope"]]
    for a in INDEX["areas"]:
        assert a["count"] == len(areas[a["cd"]]["features"])
        assert areas[a["cd"]]["cd"] == a["cd"]
    # 화면 상수(Buildings.tsx)도 같은 3km
    ts = (ROOT / "src" / "components" / "Buildings.tsx").read_text(encoding="utf-8")
    assert re.search(r"export const PROTECT_KM = 3\b", ts)


def test_no_building_inside_protected_zone(areas):
    guard = [a for a in AIRPORTS["airports"] if a.get("military_shared")]
    assert {a["id"] for a in guard} == set(INDEX["protected"]) == {"cjj", "tae", "pus"}
    for fc in areas.values():
        for f in fc["features"]:
            for ring in rings(f["geometry"]):
                for x, y in ring:
                    for a in guard:
                        assert haversine(y, x, a["lat"], a["lng"]) > CFG["protect_km"], (f["properties"]["id"], a["id"])


def test_hidden_shops_are_counts_only():
    for ap, counts in INDEX["hidden_shops"].items():
        assert ap in INDEX["protected"]
        assert set(counts) <= set(CFG["categories"])
        assert all(isinstance(v, int) for v in counts.values())


def test_coordinates_5_decimals(areas):
    for fc in areas.values():
        for f in fc["features"][:400]:
            for ring in rings(f["geometry"]):
                for x, y in ring:
                    assert round(x, 5) == x and round(y, 5) == y


def test_display_rule_and_properties(areas):
    cj = next(a for a in AIRPORTS["airports"] if a["id"] == AIRPORTS["target"])
    for fc in areas.values():
        for f in fc["features"]:
            p = f["properties"]
            assert set(p) <= ALLOWED
            assert p["k"] in ("lodging", "retail_food", "other")
            assert p["k"] == "lodging" or sum(p["n"]) >= CFG["min_shops"]
            assert len(p["shops"]) <= min(CFG["shop_list_max"], sum(p["n"]))
            assert all(cat in CFG["categories"] for _, cat in p["shops"])
            assert p["km"] == round(p["km"], 1)
            assert abs(p["km"] - haversine(p["cy"], p["cx"], cj["lat"], cj["lng"])) <= 0.06


def test_lodging_use_code():
    # 건축물대장 주용도코드 15000 = 숙박시설(이름에 호텔·모텔이 든 건물로 확인)
    assert CFG["use_names"]["15000"] == "숙박시설"
    assert CFG["classes"]["lodging"] == ["15000"]
