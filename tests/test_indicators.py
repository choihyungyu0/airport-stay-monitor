# -*- coding: utf-8 -*-
"""지표 회귀 테스트(OPS-04). 기대값은 tests/expected.json, 데이터 갱신 시 그 파일만 교체한다."""
import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_data as b  # noqa: E402
import indicators as ind  # noqa: E402

E = json.loads((ROOT / "tests" / "expected.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def cfg():
    return b.load_config()


@pytest.fixture(scope="module")
def model(cfg):
    return b.Model(cfg)


@pytest.fixture(scope="module")
def built(cfg):
    out = b.build_all(cfg)
    return {k: json.loads(v) for k, v in out.items()}


def airport(built, aid):
    return next(a for a in built["indicators.json"]["airports"] if a["id"] == aid)


# ── 데이터 ──────────────────────────────────────────────────────────

def test_dat01_arrivals_total_excludes_subtotals(model):
    """DAT-01·BR-D5: 교포·대륙 소계를 빼면 청주 반기 합 30,030 / 62,891."""
    col = model.ap[E["arrivals_total"]["airport"]]["column"]
    for half, want in E["arrivals_total"]["values"].items():
        assert model.arr.total_all(col, ind.half_months(half)) == want


def test_dat02_visits(model):
    v = E["visits"]
    assert model.vis[(v["region"], v["nat"], v["month"])] == v["value"]


def test_dat03_card_correction(model):
    """BR-D1: 충북 시도 카드 59.4억 + 청주 4구 → 191.1억, 대만 1,019,084,278원."""
    c = E["card_correction"]
    ms = ind.half_months(c["half"])
    before = sum(v for (r, _k, p), v in model.card_raw.items() if r == c["region"] and p in ms)
    after = sum(v for (r, _k, p), v in model.card.items() if r == c["region"] and p in ms)
    assert round(before / 1e8, 1) == c["before_eok"]
    assert round(after / 1e8, 1) == c["after_eok"]
    assert round(sum(model.card[(c["region"], c["nat"], m)] for m in ms)) == c["nat_won"]


def test_dat04_easypay_effect(model, cfg):
    e = E["easypay"]
    ep = ind.easypay_effect(ROOT / "data" / "raw" / cfg["sources"]["easypay"], e["region"], e["nat"], e["half"], model.card)
    assert round(ep["effect"] * 100, 2) == e["effect_pct"]


def test_dat05_boundary_joined_wgs84(built):
    g = built["boundary_43.geojson"]
    cds = {f["properties"]["cd"] for f in g["features"]}
    assert len(g["features"]) == E["boundary"]["count"]
    assert set(E["boundary"]["cheongju_gu"]) <= cds
    for f in g["features"]:
        ring = f["geometry"]["coordinates"][0] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"][0][0]
        lng, lat = ring[0]
        assert 127 < lng < 129 and 36 < lat < 37.5  # 충북, WGS84


def test_dat05_unmapped_code_fails(cfg):
    bad = copy.deepcopy(cfg)
    bad["region_map"]["sgg"] = [s for s in bad["region_map"]["sgg"] if s.get("sgis_cd") != "33044"]
    with pytest.raises(ind.DataError, match="코드 대응 실패"):
        b.build_boundary(b.Model(bad))


def test_dat06_report(built):
    rep = built["meta.json"]["report"]
    checks = {c["id"]: c for c in rep["checks"]}
    assert rep["status"] == "ok"
    items = checks["C4"]["items"]
    chungbuk = [i for i in items if i["sido"] == "충북"]
    assert all(i["status"] == "ok" for i in chungbuk), chungbuk
    assert {i["sido"] for i in items if i["status"] == "skip"} <= {"부산", "대구", "제주"}
    assert rep["consistency"]["mismatch"] == 0


def test_dat01_bad_month_raises(tmp_path, cfg):
    p = tmp_path / "entry.csv"
    p.write_text("country,ym,cjj\n대만,2026-01,10\n", encoding="utf-8")
    with pytest.raises(ind.DataError, match="기준월 형식 오류: 2026-01"):
        ind.load_arrivals(p, cfg["region_map"], ["cjj"], ind.Log())


def test_dat01_negative_raises(tmp_path, cfg):
    p = tmp_path / "entry.csv"
    p.write_text("country,ym,cjj\n대만,202601,-3\n", encoding="utf-8")
    with pytest.raises(ind.DataError, match="입국자 값 오류: cjj 202601"):
        ind.load_arrivals(p, cfg["region_map"], ["cjj"], ind.Log())


def test_dat01_blank_is_zero_with_warning(tmp_path, cfg):
    p = tmp_path / "entry.csv"
    p.write_text("country,ym,cjj\n대만,202601,\n아시아주,202601,5\n", encoding="utf-8")
    log = ind.Log()
    arr = ind.load_arrivals(p, cfg["region_map"], ["cjj"], log)
    assert arr.get("대만", "cjj", "202601") == 0
    assert arr.get("아시아주", "cjj", "202601") is None
    assert log.count("warn") == 1


# ── 지표 ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", E["half"], ids=lambda c: f"{c['airport']}-{c['nat']}-{c['half']}")
def test_ind01_02_half(built, case):
    h = airport(built, case["airport"])["nat"][case["nat"]]["halves"][case["half"]]
    assert h["per_arrival_spend"] == case["per"]
    if "ratio" in case:
        assert h["visit_ratio"] == case["ratio"]
    if "arrivals" in case:
        assert h["arrivals"] == case["arrivals"]


def test_ind01_arrivals_growth(built):
    g = E["arrivals_growth"]
    hv = airport(built, g["airport"])["nat"][g["nat"]]["halves"]
    assert round((hv["2026H1"]["arrivals"] / hv["2025H1"]["arrivals"] - 1) * 100) == g["pct"]


def test_bri2_small_months_are_null(built):
    """BR-I2: 월 입국 300명 미만 달은 ①·② 월별 값이 null."""
    assert ind.monthly_ratio(1_000_000, 299, 300) is None
    assert ind.monthly_ratio(1_000_000, 0, 300) is None
    assert ind.monthly_ratio(900, 300, 300) == 3
    ind_json = built["indicators.json"]
    for a in ind_json["airports"]:
        for v in a["nat"].values():
            if "monthly" not in v:
                continue
            mo = v["monthly"]
            for x, p, r in zip(mo["arr"], mo["per"], mo["ratio"]):
                if x is None or x < ind_json["min_monthly_arrivals"]:
                    assert p is None and r is None
                else:
                    assert p is not None


@pytest.mark.parametrize("case", E["v2"], ids=lambda c: f"{c['airport']}-{c['nat']}")
def test_ind03_v2(built, case):
    v = airport(built, case["airport"])["nat"][case["nat"]]["v2"]
    for k in ("lv", "li", "dv", "di"):
        if k in case:
            assert v[k] == pytest.approx(case[k], abs=0.005)
    assert v["pass"] is case["pass"]
    assert v["n"] >= 24


def test_ind03_hold_when_short(model):
    v = ind.v2_test(model.arr, model.vis, model.ap["cjj"], "icn", "대만", ["202601", "202602", "202603"], 0.5, 24)
    assert v["status"] == "보류" and v["pass"] is False


def test_ind04_kitagawa(built, model):
    k, want = built["indicators.json"]["decomposition"], E["kitagawa"]
    tol = want["tolerance"]
    for key in ("R0", "R1", "total", "comp"):
        assert abs(k[key] - want[key]) <= tol, key
    for c, v in want["rate"].items():
        assert abs(k["rate"][c] - v) <= tol, c
    assert k["pct"] == want["pct"]
    exact = model.decomposition()
    assert abs(exact["residual"]) < 1e-6  # comp + Σrate = R1 − R0


def test_ind04_skip_with_one_nat(model):
    k = ind.kitagawa(model.arr, model.card, model.ap["cjj"], ["대만"], "2025H1", "2026H1")
    assert k["skipped"] and "생략" in k["reason"]


def test_ind05_sgg(built):
    items = {i["cd"]: i for i in built["sgg.json"]["items"]}
    for case in E["sgg"]:
        v = items[case["cd"]]["nat"][case["nat"]]
        assert v["per_visit"] == case["per_visit"]
        if "visit_mavg" in case:
            assert v["visit_mavg"] == case["visit_mavg"]
        if "card_mil" in case:
            assert round(v["card"] / 1e6, 1) == case["card_mil"]
    top = E["sgg_top"]
    first = max(built["sgg.json"]["items"], key=lambda i: i["nat"][top["nat"]]["visit_mavg"] or 0)
    assert first["cd"] == top["first_cd"]


def test_ind06_scenario(built):
    s = E["scenario"]
    t = airport(built, s["airport"])["nat"][s["nat"]]["halves"]["2026H1"]
    c = airport(built, s["compare"])["nat"][s["nat"]]["halves"]["2026H1"]
    assert round(t["per_day"]) == s["per_day_low"]
    assert round(c["per_day"]) == s["per_day_high"]
    r = ind.scenario(t["arrivals"], s["days"], t["per_day"], c["per_day"])
    assert round(r["low"] / 1e8, 1) == s["low_eok"]
    assert round(r["high"] / 1e8, 1) == s["high_eok"]
    with pytest.raises(ValueError):
        ind.scenario(t["arrivals"], 2.5, t["per_day"], c["per_day"])


# ── 확장·운영 ─────────────────────────────────────────────────────────

def test_ui12_extra_airport_without_region_data(cfg):
    """UI-12: 설정 1줄로 5번째 공항. 권역 자료가 없으면 자료 없음(ST-04)."""
    ext = copy.deepcopy(cfg)
    ext["airports"]["airports"].append({"id": "mwx", "name": "무안", "column": "mwx", "region": "전남", "color": "extra"})
    ext["airports"]["airports"].append({"id": "gmp", "name": "김포", "column": "gmp", "region": "서울", "color": "extra"})
    m = b.Model(ext)
    out = b.build_indicators(m)
    ids = [a["id"] for a in out["airports"]]
    assert ids[-2:] == ["mwx", "gmp"]
    assert out["airports"][-2]["nat"]["대만"]["status"] == "자료 없음"
    assert out["airports"][-1]["nat"]["대만"]["status"] in ("채택", "참고값")


def test_outputs_are_committed_and_current(cfg):
    """public/data의 JSON이 원천·코드와 일치(갱신 후 커밋 누락 방지)."""
    for name, text in b.build_all(cfg).items():
        path = ROOT / "public" / "data" / name
        assert path.exists(), name
        assert path.read_text(encoding="utf-8") == text, f"{name}이 최신이 아닙니다 → npm run build:data"
