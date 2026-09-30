# -*- coding: utf-8 -*-
"""원천 CSV → public/data/*.json (DAT-01~06, IND-01~06).

실행: python scripts/build_data.py            산출 JSON을 public/data에 쓴다
      python scripts/build_data.py --check    다시 산출해 커밋된 JSON과 같은지만 확인한다(CI)

원천 오류(기준월 형식·음수 입국자·코드 대응 실패)는 DataError로 빌드를 멈춘다.
정합성 불일치는 빌드를 계속하되 meta.json 리포트에 남겨 화면 경고 배지로 보인다(DAT-06).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import indicators as ind  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CONFIG = ROOT / "data" / "config"
OUT = ROOT / "public" / "data"
OUTPUT_FILES = ("indicators.json", "sgg.json", "boundary_43.geojson", "boundary_sido.geojson", "meta.json")


def load_config(config_dir: Path = CONFIG) -> dict:
    names = ("airports", "region_map", "gu_cities", "settings", "sources", "reference_values", "airport_supply", "tw_pins")
    return {n: json.loads((config_dir / f"{n}.json").read_text(encoding="utf-8")) for n in names}


def rint(x):
    """JS Math.round와 같은 반올림(0.5 올림). None은 그대로."""
    return None if x is None else int(math.floor(x + 0.5))


def rnd(x, n):
    return None if x is None else round(x, n)


# ── 산출 ────────────────────────────────────────────────────────────

class Model:
    """원천 적재 결과와 지표를 한 번에 들고 다닌다. 테스트도 이 객체를 쓴다."""

    def __init__(self, cfg: dict, raw_dir: Path = RAW):
        self.cfg = cfg
        self.raw_dir = raw_dir
        self.log = ind.Log()
        src, rm = cfg["sources"], cfg["region_map"]
        columns = sorted({a["column"] for a in cfg["airports"]["airports"]} | {cfg["airports"]["reference_airport"]})
        self.entry_rows = len(ind.read_csv(raw_dir / src["entry"]))
        self.arr = ind.load_arrivals(raw_dir / src["entry"], rm, columns, self.log)
        self.dl = ind.load_datalab([raw_dir / p for p in src["datalab"]], rm, self.log)
        self.card, self.card_raw = ind.corrected_card(self.dl, cfg["gu_cities"], self.log)
        self.vis = ind.sido_visits(self.dl)
        st = cfg["settings"]
        self.base, self.target = st["halves"]["base"], st["halves"]["target"]
        self.airports = cfg["airports"]["airports"]
        self.ap = {a["id"]: a for a in self.airports}

    # 공항×국적 자료 유무(ST-04)
    def available(self, airport: dict, nat: str) -> bool:
        reg = airport["region"]
        has_vis = any(k[0] == reg and k[1] == nat for k in self.vis)
        has_arr = self.arr.total(nat, airport["column"], self.arr.months) > 0
        return has_vis and has_arr

    def half(self, airport_id: str, nat: str, half: str) -> dict:
        return ind.half_values(self.arr, self.card, self.vis, self.ap[airport_id], nat, half)

    def v2_months(self, airport: dict) -> list[str]:
        st = self.cfg["settings"]
        vis_months = [k[2] for k in self.vis if k[0] == airport["region"]]
        end = min(self.arr.latest, max(vis_months)) if vis_months else self.arr.latest
        return ind.month_range(st["v2"]["start"], end)

    def v2(self, airport_id: str, nat: str, min_diff: float | None = None) -> dict:
        st = self.cfg["settings"]["v2"]
        a = self.ap[airport_id]
        return ind.v2_test(self.arr, self.vis, a, self.cfg["airports"]["reference_airport"], nat,
                           self.v2_months(a), st["min_diff_corr"] if min_diff is None else min_diff,
                           st["min_months"])

    def decomposition(self) -> dict:
        tid = self.cfg["airports"]["target"]
        nats = [n for n in self.cfg["settings"]["nationalities"] if self.v2(tid, n)["pass"]]
        return ind.kitagawa(self.arr, self.card, self.ap[tid], nats, self.base, self.target)

    def series_months(self) -> list[str]:
        return ind.month_range(self.cfg["settings"]["series_start"], self.arr.latest)

    def sgg(self) -> list[dict]:
        """IND-05. 원천 시군구 행이 있으면 원천값, 없으면 시군구 정리표 값을 쓴다."""
        st = self.cfg["settings"]["sgg"]
        rows = {r["datalab_cd"]: r for r in ind.read_csv(self.raw_dir / self.cfg["sources"]["sgg_table"])}
        raw_regions = self.dl.regions("vis", "sgg")
        out = []
        for s in self.cfg["region_map"]["sgg"]:
            if s["sido"] != st["sido"]:
                continue
            item = {"cd": s["datalab_cd"], "sgis_cd": s.get("sgis_cd"), "region": s["region"],
                    "name": s["short"], "full": s["full"]}
            if s["region"] in raw_regions:
                item["source"] = "raw"
                item["nat"] = {n: ind.sgg_from_raw(self.dl, s["region"], n, st["period"])
                               for n in self.cfg["settings"]["nationalities"]}
                item["all"] = ind.sgg_from_raw(self.dl, s["region"], None, st["period"])
            elif s["datalab_cd"] in rows:
                item["source"] = "table"
                item["nat"] = {n: ind.sgg_from_table(rows[s["datalab_cd"]], n)
                               for n in self.cfg["settings"]["nationalities"]}
                item["all"] = ind.sgg_from_table(rows[s["datalab_cd"]], None)
            else:
                item["source"] = "none"
                item["nat"] = {n: ind.sgg_metric(None, None) for n in self.cfg["settings"]["nationalities"]}
                item["all"] = ind.sgg_metric(None, None)
            out.append(item)
        return out


def build_indicators(m: Model) -> dict:
    st = m.cfg["settings"]
    months = m.series_months()
    min_arr = st["min_monthly_arrivals"]
    airports = []
    for a in m.airports:
        entry = {k: a[k] for k in ("id", "name", "region", "color", "lat", "lng") if k in a}
        entry["role"] = a.get("role", "compare")
        entry["military_shared"] = bool(a.get("military_shared"))
        sup = m.cfg["airport_supply"]["lodging"].get(a["id"])
        if sup:
            entry["lodging"] = sup
        entry["nat"] = {}
        for nat in st["nationalities"]:
            if not m.available(a, nat):
                entry["nat"][nat] = {"status": "자료 없음"}
                continue
            col, reg = a["column"], a["region"]
            arr_s = [m.arr.get(nat, col, x) for x in months]
            vis_s = [m.vis.get((reg, nat, x)) for x in months]
            card_s = [m.card.get((reg, nat, x)) for x in months]
            halves = {}
            for h in (m.base, m.target):
                hv = m.half(a["id"], nat, h)
                halves[h] = {
                    "arrivals": hv["arrivals"],
                    "card": rint(hv["card"]),
                    "vis_mavg": rnd(hv["vis_mavg"], 1),
                    "per_arrival_spend": rint(hv["per_arrival_spend"]),
                    "visit_ratio": rnd(hv["visit_ratio"], 2),
                    "per_day": rnd(ind.per_person_day(hv), 2),
                }
            v2 = m.v2(a["id"], nat)
            entry["nat"][nat] = {
                "status": v2["status"],
                "halves": halves,
                "v2": {k: rnd(v2[k], 2) for k in ("lv", "li", "dv", "di")}
                      | {"pass": v2["pass"], "status": v2["status"], "n": v2["n"], "window": v2["window"]},
                "monthly": {
                    "arr": arr_s,
                    "vis": [rint(v) for v in vis_s],
                    "card": [rint(v) for v in card_s],
                    "per": [rint(ind.monthly_ratio(k, x, min_arr)) for k, x in zip(card_s, arr_s)],
                    "ratio": [rnd(ind.monthly_ratio(v, x, min_arr), 3) for v, x in zip(vis_s, arr_s)],
                },
            }
        airports.append(entry)

    dec = m.decomposition()
    if not dec["skipped"]:
        # 표시값은 모두 반올림한다(대만 293.55 → +294). 버림이면 구성·국적별 효과의 합이 가중 1인당 변화와 1원 어긋난다.
        dec = {
            "skipped": False, "airport": dec["airport"], "region": dec["region"], "nats": dec["nats"],
            "base": dec["base"], "target": dec["target"],
            "R0": rint(dec["R0"]), "R1": rint(dec["R1"]), "total": rint(dec["total"]), "pct": rnd(dec["pct"], 1),
            "comp": rint(dec["comp"]),
            "rate": {c: rint(v) for c, v in dec["rate"].items()},
            "r0": {c: rint(v) for c, v in dec["r0"].items()},
            "r1": {c: rint(v) for c, v in dec["r1"].items()},
            "s0": {c: rnd(v, 4) for c, v in dec["s0"].items()},
            "s1": {c: rnd(v, 4) for c, v in dec["s1"].items()},
            "residual": rnd(dec["residual"], 6),
        }

    tid = m.cfg["airports"]["target"]
    industry = ind.corrected_industry(m.dl, m.cfg["gu_cities"], m.ap[tid]["region"])
    return {
        "version": 1,
        "months": months,
        "nationalities": st["nationalities"],
        "halves": st["halves"],
        "min_monthly_arrivals": min_arr,
        "definition_change": st["foreigner_definition_change"],
        "target": tid,
        "airports": airports,
        "decomposition": dec,
        "scenario": st["scenario"],
        "supply": {k: m.cfg["airport_supply"][k] for k in ("source", "note", "radii_km")},
        "industry": {"region": m.ap[tid]["region"],
                     "periods": {p: {k: rint(v) for k, v in c.items()} for p, c in industry.items()}},
    }


def build_sgg(m: Model) -> dict:
    st = m.cfg["settings"]["sgg"]

    def clean(x):
        # 월평균 방문은 시군구 정리표와 같게 round()(0.5는 짝수 쪽)로 정수화한다(흥덕 일본 7,248.5 → 7,248).
        v = x["visit_mavg"]
        return {"visit_mavg": None if v is None else round(v), "card": rint(x["card"]), "per_visit": rint(x["per_visit"])}

    items = []
    for s in m.sgg():
        items.append({k: s[k] for k in ("cd", "sgis_cd", "region", "name", "full", "source")}
                     | {"nat": {n: clean(v) for n, v in s["nat"].items()}, "all": clean(s["all"])})
    return {"sido": st["sido"], "period": st["period"], "airport_cd": st["airport_cd"],
            "top_n": st["top_n"], "bins": st["bins"], "items": items, "pins": build_pins(m)}


def build_pins(m: Model) -> dict:
    """대만 타깃 콘텐츠 지점(tw_pins.json). 시군구는 데이터랩 표기 → 행정표준 코드로 잇는다."""
    cfg = m.cfg["tw_pins"]
    cd = {s["region"]: s["datalab_cd"] for s in m.cfg["region_map"]["sgg"]}
    keys = ("name", "region", "representative", "place", "address", "lat", "lng", "looked_up_on", "verified_on")
    pins = [{k: p[k] for k in keys} | {"cd": cd[p["region"]]} for p in cfg["pins"]]
    return {"source": cfg["source"], "items": pins}


# ── DAT-05 경계 ──────────────────────────────────────────────────────

def read_boundary(path: Path) -> list[tuple[dict, dict]]:
    """(속성, geometry) 목록. GeoJSON 또는 SGIS SHP(.shp/.zip, cp949)."""
    if path.suffix.lower() in (".geojson", ".json"):
        g = json.loads(path.read_text(encoding="utf-8"))
        return [(f["properties"], f["geometry"]) for f in g["features"]]
    import shapefile  # pyshp
    r = shapefile.Reader(str(path), encoding="cp949")
    names = [f[0] for f in r.fields[1:]]
    return [(dict(zip(names, sr.record)), sr.shape.__geo_interface__) for sr in r.iterShapeRecords()]


def simplify(points: list, tol: float) -> list:
    """Douglas-Peucker. 닫힌 고리는 4점 미만이 되면 원본을 둔다."""
    if len(points) < 5:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        ax, ay = points[s]
        bx, by = points[e]
        dx, dy = bx - ax, by - ay
        seg = math.hypot(dx, dy)
        dmax, idx = 0.0, -1
        for i in range(s + 1, e):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / seg if seg else math.hypot(px - ax, py - ay)
            if d > dmax:
                dmax, idx = d, i
        if dmax > tol and idx > 0:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    out = [p for p, k in zip(points, keep) if k]
    return out if len(out) >= 4 else points


def ring_centroid(ring: list) -> tuple[float, float, float]:
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if not a:
        xs, ys = zip(*ring)
        return sum(xs) / len(xs), sum(ys) / len(ys), 0.0
    return cx / (3 * a), cy / (3 * a), abs(a) / 2


def build_boundary(m: Model, tol_m: float = 30.0) -> dict:
    """EPSG:5179 → WGS84 변환·단순화, SGIS 코드 → 행정표준 코드 조인. 대응 실패는 빌드 실패."""
    from pyproj import Transformer

    st = m.cfg["settings"]["sgg"]
    targets = {s["sgis_cd"]: s for s in m.cfg["region_map"]["sgg"] if s["sido"] == st["sido"] and s.get("sgis_cd")}
    prefix = {c[:2] for c in targets}
    tf = Transformer.from_crs(5179, 4326, always_xy=True)
    feats, seen = [], set()
    for props, geom in read_boundary(m.raw_dir / m.cfg["sources"]["boundary"]):
        sgis = str(props.get("sgis_cd") or props.get("SIGUNGU_CD") or "")
        if sgis[:2] not in prefix:
            continue
        if sgis not in targets:
            raise ind.DataError(f"코드 대응 실패: {sgis}")
        s = targets[sgis]
        if props.get("datalab_cd") and str(props["datalab_cd"]) != s["datalab_cd"]:
            raise ind.DataError(f"코드 대응 실패: {sgis} (경계 {props['datalab_cd']} ≠ 대응표 {s['datalab_cd']})")
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        best = (0.0, 0.0, -1.0)
        out_polys = []
        for poly in polys:
            rings = []
            for i, ring in enumerate(poly):
                pts = simplify([tuple(p[:2]) for p in ring], tol_m)
                if i == 0:
                    c = ring_centroid(pts)
                    if c[2] > best[2]:
                        best = c
                rings.append([[round(x, 5), round(y, 5)] for x, y in (tf.transform(px, py) for px, py in pts)])
            out_polys.append(rings)
        cx, cy = tf.transform(best[0], best[1])
        feats.append({
            "type": "Feature",
            "properties": {"cd": s["datalab_cd"], "sgis_cd": sgis, "name": s["short"], "full": s["full"],
                           "cx": round(cx, 5), "cy": round(cy, 5)},
            "geometry": {"type": "MultiPolygon", "coordinates": out_polys} if len(out_polys) > 1
            else {"type": "Polygon", "coordinates": out_polys[0]},
        })
        seen.add(sgis)
    missing = sorted(set(targets) - seen)
    if missing:
        raise ind.DataError("코드 대응 실패: 경계 없음 " + ", ".join(missing))
    feats.sort(key=lambda f: f["properties"]["cd"])
    return {"type": "FeatureCollection", "features": feats}


def build_boundary_sido(m: Model) -> dict:
    """공항 권역 시도 윤곽(지도 탭 행 클릭 강조). scripts/extract_sido.py가 뽑아 둔 EPSG:5179 → WGS84."""
    from pyproj import Transformer

    tf = Transformer.from_crs(5179, 4326, always_xy=True)
    feats = []
    for props, geom in read_boundary(m.raw_dir / m.cfg["sources"]["sido_boundary"]):
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        out = [[[[round(x, 4), round(y, 4)] for x, y in (tf.transform(px, py) for px, py in ring)] for ring in poly]
               for poly in polys]
        feats.append({"type": "Feature", "properties": {"sgis_cd": props["sgis_cd"], "region": props["name"]},
                      "geometry": {"type": "MultiPolygon", "coordinates": out}})
    have = {f["properties"]["region"] for f in feats}
    missing = sorted({a["region"] for a in m.airports} - have)
    if missing:
        m.log.add("warn", "DAT-05", f"시도 경계 없음 → 권역 강조 생략: {', '.join(missing)}")
    return {"type": "FeatureCollection", "features": feats}


def _in_ring(lng: float, lat: float, ring: list) -> bool:
    hit = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        if (y0 > lat) != (y1 > lat) and lng < (x1 - x0) * (lat - y0) / (y1 - y0) + x0:
            hit = not hit
    return hit


def point_in_polygon(lng: float, lat: float, geom: dict) -> bool:
    """(구멍을 뺀) 다각형 안에 점이 있는지. 좌표는 [경도, 위도]."""
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return any(_in_ring(lng, lat, poly[0]) and not any(_in_ring(lng, lat, h) for h in poly[1:]) for poly in polys)


# ── DAT-06 검증 리포트 ────────────────────────────────────────────────

def check(cid, name, status, detail, **extra):
    return {"id": cid, "name": name, "status": status, "detail": detail, **extra}


def build_report(m: Model, boundary: dict | None) -> dict:
    cfg, st = m.cfg, m.cfg["settings"]
    checks = []

    # C1 행수
    dl_rows = {f"{lv}/{k}": n for (lv, k), n in sorted(m.dl.rows.items())}
    ep_rows = len(ind.read_csv(m.raw_dir / cfg["sources"]["easypay"]))
    files = [
        {"file": cfg["sources"]["entry"], "rows": m.entry_rows, "loaded": len(m.arr.table)},
        *({"file": p, "rows": sum(m.dl.rows.values()), "by": dl_rows} for p in cfg["sources"]["datalab"]),
        {"file": cfg["sources"]["easypay"], "rows": ep_rows},
        {"file": cfg["sources"]["sgg_table"], "rows": len(ind.read_csv(m.raw_dir / cfg["sources"]["sgg_table"]))},
    ]
    empty = [f["file"] for f in files if not f["rows"]]
    checks.append(check("C1", "행수", "fail" if empty else "pass",
                        f"입국 {len(m.arr.table):,}행 적재 · 데이터랩 {sum(m.dl.rows.values()):,}행 · 간편결제 {ep_rows:,}행"
                        + (f" · 빈 파일 {', '.join(empty)}" if empty else ""), files=files))

    # C2 월 연속성
    gaps = []
    g = ind.month_gaps(m.arr.months)
    if g:
        gaps.append(f"입국 {', '.join(g)}")
    for reg in sorted({a["region"] for a in m.airports}):
        for kind in ("vis", "card"):
            g = ind.month_gaps(m.dl.periods(kind, "sido", reg))
            if g:
                gaps.append(f"{reg} {kind} {', '.join(g)}")
    checks.append(check("C2", "월 연속성", "fail" if gaps else "pass",
                        "빠진 달 없음 · 입국 %s~%s · 데이터랩 %s~%s" % (
                            m.arr.months[0], m.arr.latest,
                            m.dl.periods("vis", "sido")[0], m.dl.periods("vis", "sido")[-1]) if not gaps
                        else "빠진 달: " + " / ".join(gaps)))

    # C3 결측
    miss = []
    for a in m.airports:
        for nat in st["nationalities"]:
            for h in (m.base, m.target):
                hv = m.half(a["id"], nat, h)
                if m.available(a, nat) and hv["vis_months"] < 6:
                    miss.append(f"{a['name']} {nat} {h} 방문 {hv['vis_months']}/6개월")
    blank_logs = [i["msg"] for i in m.log.items if i["code"] == "DAT-01" and i["level"] == "warn"]
    checks.append(check("C3", "결측", "warn" if (miss or blank_logs) else "pass",
                        "비교 반기 결측 없음" if not (miss or blank_logs) else " / ".join(miss + blank_logs)))

    # C4 시도 = 시군구 합 정합성 (BR-D1)
    items = []
    month = st["consistency"]["month"]
    tol = st["consistency"]["tolerance"]
    sgg_of = {}
    for s in cfg["region_map"]["sgg"]:
        sgg_of.setdefault(s["sido"], []).append(s["region"])
    have_sgg = m.dl.regions("card", "sgg")
    for sido in st["consistency"]["sido"]:
        regs = [r for r in sgg_of.get(sido, []) if r in have_sgg]
        sido_v = sum(v for (lv, r, _c, p), v in m.dl.card.items() if lv == "sido" and r == sido and p == month)
        if not regs:
            items.append({"sido": sido, "period": month, "status": "skip", "sido_value": rint(sido_v),
                          "detail": "시군구 카드 자료 미적재 — 데이터랩에서 시군구 CSV를 받으면 자동 대조"})
            continue
        sgg_v = sum(v for (lv, r, _c, p), v in m.dl.card.items() if lv == "sgg" and r in regs and p == month)
        ok = abs(sido_v - sgg_v) <= tol * max(sido_v, 1)
        items.append({"sido": sido, "period": month, "status": "ok" if ok else "mismatch",
                      "sido_value": rint(sido_v), "sgg_sum": rint(sgg_v),
                      "detail": f"시도 {sido_v:,.0f}원 · 시군구 합 {sgg_v:,.0f}원 ({len(regs)}개)"})
    # 충북: 시도값 = 청주 외 시군구 합(2026H1, 시군구 정리표) — 구 설치 시 제외 확인
    sggs = m.sgg()
    for city in cfg["gu_cities"]["cities"]:
        if city["sido"] != st["sgg"]["sido"]:
            continue
        gu = set(city["gu"])
        others = [s for s in sggs if s["region"] not in gu and s["all"]["card"] is not None]
        per = st["sgg"]["period"]
        sido_v = sum(v for (r, _c, p), v in m.card_raw.items() if r == city["sido"] and p in ind.half_months(per))
        other_v = sum(s["all"]["card"] for s in others)
        ok = abs(sido_v - other_v) <= max(0.5e6, tol * sido_v)
        items.append({"sido": city["sido"], "period": per, "status": "ok" if ok else "mismatch",
                      "sido_value": rint(sido_v), "sgg_sum": rint(other_v),
                      "detail": f"시도 카드 {sido_v / 1e8:.1f}억 = {city['city']} 외 {len(others)}개 시군구 합 "
                                f"{other_v / 1e8:.1f}억 → {city['city']} {len(gu)}구가 빠져 있음(보정 근거)"})
    # 시군구 정리표 ↔ 원천 시군구 행
    rows = {r["datalab_cd"]: r for r in ind.read_csv(m.raw_dir / cfg["sources"]["sgg_table"])}
    agree = total = 0
    diffs = []
    for s in sggs:
        if s["source"] != "raw" or s["cd"] not in rows:
            continue
        for nat in st["nationalities"]:
            total += 1
            t = ind.sgg_from_table(rows[s["cd"]], nat)
            r = s["nat"][nat]
            same = (abs(t["visit_mavg"] - r["visit_mavg"]) <= 1
                    and abs(t["card"] - r["card"]) <= 0.051e6
                    and abs(t["per_visit"] - r["per_visit"]) <= 1)
            agree += same
            if not same:
                diffs.append(f"{s['full']} {nat}")
    items.append({"sido": st["sgg"]["sido"], "period": st["sgg"]["period"],
                  "status": "ok" if agree == total else "mismatch",
                  "detail": f"시군구 정리표 ↔ 원천 시군구 행 {agree}/{total} 일치" + (f" (불일치 {', '.join(diffs)})" if diffs else "")})
    mism = sum(1 for i in items if i["status"] == "mismatch")
    skipped = sum(1 for i in items if i["status"] == "skip")
    checks.append(check("C4", "시도-시군구 정합성", "warn" if mism else "pass",
                        f"대조 {len(items) - skipped}건 중 불일치 {mism}건 · 생략 {skipped}건(시군구 자료 없음)",
                        items=items))

    # C5 카드 추출 시점 (BR-D3)
    ext = cfg["sources"].get("card_extracted_on")
    rebase = st["card_rebase_date"]
    if not ext:
        checks.append(check("C5", "카드 추출 시점", "warn", "추출일 미기재 — sources.json card_extracted_on"))
    else:
        ok = date.fromisoformat(ext) >= date.fromisoformat(rebase)
        checks.append(check("C5", "카드 추출 시점", "pass" if ok else "warn",
                            f"추출 {ext} " + ("≥" if ok else "<") + f" 재소급 {rebase}"
                            + ("" if ok else " — 재소급 이전 자료, 다시 내려받으세요")))

    # C6 외국인 정의 변경 (BR-D4)
    change = st["foreigner_definition_change"].replace("-", "")[:6]
    early = [h for h in (m.base, m.target) if ind.half_months(h)[0] <= change]
    checks.append(check("C6", "외국인 정의 변경", "warn" if early else "pass",
                        f"비교 반기 {m.base}·{m.target} 모두 {st['foreigner_definition_change']} 이후"
                        if not early else f"{', '.join(early)}가 정의 변경 이전 월을 포함 — 반기 비교에서 제외 필요"))

    # C7 코드 대응 (DAT-05)
    if boundary is not None:
        n = len(boundary["features"])
        checks.append(check("C7", "경계 코드 대응", "pass", f"{st['sgg']['sido']} {n}개 시군구 전부 조인(SGIS → 행정표준)"))
    else:
        checks.append(check("C7", "경계 코드 대응", "skip", "경계 산출 생략"))

    # C8 지역·국가명 매핑
    unk = [i["msg"] for i in m.log.items if i["msg"].startswith("알 수 없는 지역")]
    alias = [i["msg"] for i in m.log.items if i["msg"].startswith("국가 표기 통일")]
    checks.append(check("C8", "지역·국가명 매핑", "warn" if unk else "pass",
                        " / ".join(unk + alias) if (unk or alias) else "매핑표 밖 표기 없음"))

    # C9 콘텐츠 지점: 좌표가 적힌 시군구 경계 안에 있는지(자동) + 사람 확인 여부
    if boundary is not None:
        polys = {f["properties"]["cd"]: f["geometry"] for f in boundary["features"]}
        cd = {s["region"]: s["datalab_cd"] for s in cfg["region_map"]["sgg"]}
        pins = cfg["tw_pins"]["pins"]
        outside = [p["name"] for p in pins if not point_in_polygon(p["lng"], p["lat"], polys[cd[p["region"]]])]
        unverified = [p["name"] for p in pins if not p.get("verified_on")]
        detail = f"{len(pins)}곳 모두 소속 시군구 경계 안" if not outside else f"시군구 밖: {', '.join(outside)}"
        detail += f" · 사람 확인 전 {len(unverified)}곳" if unverified else " · 사람 확인 완료"
        checks.append(check("C9", "콘텐츠 지점 좌표", "warn" if outside else "pass", detail))

    return {"checks": checks, "consistency": {"mismatch": mism, "skipped": skipped, "checked": len(items) - skipped},
            "validations": build_validations(m), "v2_table": build_v2_table(m), "log": m.log.items,
            "status": "fail" if any(c["status"] == "fail" for c in checks) else "ok"}


def build_validations(m: Model) -> list[dict]:
    cfg, st = m.cfg, m.cfg["settings"]
    tid = cfg["airports"]["target"]
    t = m.ap[tid]
    out = []

    # V1 분모 재현
    kac = cfg["reference_values"]["kac_arrivals"]
    rows, worst = [], 0.0
    for h in (m.base, m.target):
        ours = m.arr.total_all(t["column"], ind.half_months(h))
        theirs = kac["values"].get(h)
        err = abs(ours - theirs) / theirs if theirs else None
        worst = max(worst, err or 0)
        rows.append({"half": h, "ours": ours, "published": theirs, "error": rnd(err, 4)})
    ours = " / ".join(format(r["ours"], ",") for r in rows)
    published = " / ".join(format(r["published"], ",") for r in rows)
    out.append({"id": "V1", "title": "분모 재현", "status": "pass" if worst <= 0.005 else "warn",
                "summary": f"입국관광통계 합 {ours}명, 공사 발표 {published}명({t['name']}, 반기). "
                           f"오차 {math.ceil(worst * 1000) / 10:.1f}% 이내",
                "rows": rows})

    # V2 공항 연동 검정: 화면 국적(대만·일본) 기준과, 검정만 함께 돌린 국적(중국·베트남)을 포함한 기준을 따로 센다
    def v2_count(nats):
        ok = [m.v2(a["id"], n)["pass"] for a in m.airports for n in nats if m.available(a, n)]
        return len(ok), sum(ok)

    main_nats = st["nationalities"]
    extra_nats = [n for n in st["v2_nationalities"] if n not in main_nats]
    total, passed = v2_count(main_nats)
    total_all, passed_all = v2_count(st["v2_nationalities"])
    count = f"{'·'.join(main_nats)} {total}개 중 {passed}개 채택"
    if extra_nats:
        count += f"({'·'.join(extra_nats)} 포함 {total_all}개 중 {passed_all}개)"
    out.append({"id": "V2", "title": "공항 연동 검정", "status": "pass",
                "summary": f"월 수준·전월 차분 상관 모두 지역공항이 인천보다 크고 차분 상관 "
                           f"{st['v2']['min_diff_corr']} 이상일 때만 채택. {count}"})

    # V3 시도-시군구 보정
    ms = ind.half_months(m.target)
    before = sum(v for (r, _c, p), v in m.card_raw.items() if r == t["region"] and p in ms)
    after = sum(v for (r, _c, p), v in m.card.items() if r == t["region"] and p in ms)
    cities = [c for c in cfg["gu_cities"]["cities"] if c["verified"]]
    out.append({"id": "V3", "title": "시도-시군구 정합성", "status": "pass",
                "summary": f"시도 카드값에서 {'·'.join(c['city'] + ' ' + str(len(c['gu'])) + '구' for c in cities)}가 "
                           f"빠지는 것을 확인하고 시군구 값으로 보정({t['region']} {m.target[:4]} "
                           f"{'상' if m.target.endswith('1') else '하'}반기 {before / 1e8:.1f}억 → {after / 1e8:.1f}억 원)",
                "before": rint(before), "after": rint(after)})

    # V4 결제수단·거주자
    ep = ind.easypay_effect(m.raw_dir / cfg["sources"]["easypay"], t["region"], "대만", m.target, m.card)
    eff = ep["effect"] if ep else None
    out.append({"id": "V4", "title": "결제수단·거주자", "status": "pass" if eff is not None else "skip",
                "summary": (f"간편결제를 더해도 {t['region']} 대만 소비 +{eff * 100:.2f}%(간편결제 단위 천원 추정). "
                            if eff is not None else "간편결제 자료 없음. ")
                           + "장기체류자 결제가 섞이는 국적은 1인당 미산출",
                "effect": rnd(eff, 5)})

    # V5 가이드라인
    out.append({"id": "V5", "title": "가이드라인", "status": "pass",
                "summary": f"방문자는 시간·공간 합산 없이 월평균 비율만 사용, 외국인 정의 변경"
                           f"({st['foreigner_definition_change'].replace('-', '.')}) 이후 구간만 비교"})

    # V6 국가승인통계 대조 (원자료 비공개 → 결과값만)
    v6 = cfg["reference_values"]["v6"]
    out.append({"id": "V6", "title": "국가승인통계 대조", "status": "static",
                "summary": f"{v6['nat']} {v6['n_sido']}개 시도의 방문 인·일 ÷ 전국 입국과 외래관광객조사 1인당 시도 "
                           f"체재일의 상관 {v6['r']:.2f}(순위 {v6['rho']:.2f}). 원자료는 개인 신청 자료라 결과값만 싣습니다",
                "r": v6["r"], "rho": v6["rho"]})
    return out


def build_v2_table(m: Model) -> list[dict]:
    """V2 전체 표와 임계값 민감도(IS-04)."""
    st = m.cfg["settings"]
    rows = []
    for a in m.airports:
        for nat in st["v2_nationalities"]:
            if not m.available(a, nat):
                continue
            v = m.v2(a["id"], nat)
            sens = {str(t): ind.v2_pass(v["lv"], v["li"], v["dv"], v["di"], t) for t in st["v2"]["sensitivity"]}
            rows.append({"airport": a["name"], "nat": nat, **{k: rnd(v[k], 2) for k in ("lv", "li", "dv", "di")},
                         "pass": v["pass"], "status": v["status"], "n": v["n"], "sensitivity": sens})
    return rows


def build_meta(m: Model, report: dict) -> dict:
    st = m.cfg["settings"]
    return {
        "asof": {
            "arrivals_latest": m.arr.latest,
            "datalab_latest": m.dl.periods("vis", "sido")[-1],
            "datalab_extract": m.cfg["sources"].get("datalab_extract"),
            "card_extracted_on": m.cfg["sources"].get("card_extracted_on"),
            "card_rebase_date": st["card_rebase_date"],
            "halves": [st["halves"]["base"], st["halves"]["target"]],
            "sgg_period": st["sgg"]["period"],
        },
        "sources": [
            "한국관광 데이터랩 외래객 지역별 방한현황(국가별 외국인 방문 현황, 외국인 신용카드 국가별 관광소비 현황, 외국인 업종별 신용카드 관광소비 추이, 외국인 간편결제)",
            "관광지식정보시스템 입국관광통계(입국항 × 국가 × 월)",
            "외래관광객조사 2025 원자료(결과값만)",
            "통계청 SGIS 행정구역 경계(2025.2Q)",
            "국토교통부 GIS건물통합정보(브이월드 WFS, 건물 레이어 — scripts/build_buildings.py)",
            "소상공인시장진흥공단 상가(상권)정보 2026.6(건물 레이어의 숙박·음식·소매 업소)",
        ],
        "report": report,
    }


# ── 쓰기 ─────────────────────────────────────────────────────────────

def dumps(obj, compact: bool) -> str:
    if compact:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def build_all(cfg: dict | None = None, raw_dir: Path = RAW) -> dict[str, str]:
    cfg = cfg or load_config()
    m = Model(cfg, raw_dir)
    boundary = build_boundary(m)
    sido = build_boundary_sido(m)
    report = build_report(m, boundary)
    return {
        "indicators.json": dumps(build_indicators(m), True),
        "sgg.json": dumps(build_sgg(m), False),
        "boundary_43.geojson": dumps(boundary, True),
        "boundary_sido.geojson": dumps(sido, True),
        "meta.json": dumps(build_meta(m, report), False),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="커밋된 산출 JSON이 최신인지 확인만 한다")
    args = ap.parse_args()
    try:
        outputs = build_all()
    except ind.DataError as e:
        print(f"[빌드 실패] {e}", file=sys.stderr)
        return 1

    meta = json.loads(outputs["meta.json"])
    report = meta["report"]
    for c in report["checks"]:
        mark = {"pass": "PASS", "warn": "WARN", "fail": "FAIL", "skip": "SKIP"}[c["status"]]
        print(f"[{c['id']}] {c['name']:<12} {mark}  {c['detail']}")
    for v in report["validations"]:
        print(f"[{v['id']}] {v['title']:<12} {v['status'].upper():<6} {v['summary']}")

    if args.check:
        stale = [n for n, text in outputs.items()
                 if not (OUT / n).exists() or (OUT / n).read_text(encoding="utf-8") != text]
        if stale:
            print(f"\n산출 JSON이 원천과 다릅니다: {', '.join(stale)} → npm run build:data 후 커밋", file=sys.stderr)
            return 1
        print("\n산출 JSON 최신")
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for n, text in outputs.items():
            (OUT / n).write_text(text, encoding="utf-8", newline="\n")
        print(f"\n→ {', '.join(OUTPUT_FILES)} ({OUT.relative_to(ROOT)})")
    if report["status"] == "fail":
        print("검증 실패 항목이 있어 배포를 멈춥니다.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
