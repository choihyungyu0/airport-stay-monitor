# -*- coding: utf-8 -*-
"""
건물 클릭 레이어(지시서 8장) — 숙박·음식·소매 업소가 있는 건물만 골라 시군구별 GeoJSON으로 만든다.

  건물 윤곽·주용도: 국토교통부 GIS건물통합정보를 브이월드 WFS(lt_c_bldginfo)로 빌드 때 한 번 받는다
                    (사각119 scripts/fetch_buildings.py와 같은 방식). 실행 중에는 외부 호출이 없다.
  업소: 소상공인시장진흥공단 상가(상권)정보 충북 CSV(2026.6). 숙박·음식·소매만.
  결합: WFS 건물에 건물관리번호(bd_mgt_sn)가 비어 있어, 업소 좌표가 들어가는 건물(point-in-polygon)로 잇고
        안 들어가면 같은 지번(PNU)의 건물(50m 안), 그래도 없으면 15m 안의 가장 가까운 건물로 잇는다.
  남기는 건물: 주용도 숙박시설 + 건물 안 숙박·음식·소매 업소 3곳 이상.
  공항 보호구역: 공군과 활주로를 같이 쓰는 공항 중심 3km 안의 건물·업소 위치는 넣지 않는다(개수만 센다).
  건물별 외국인 소비·방문 값은 없으므로 만들지 않는다.

사용법:
  python scripts/build_buildings.py            # 받은 캐시가 있으면 브이월드에 다시 묻지 않는다
  python scripts/build_buildings.py --offline  # 캐시만 쓴다(없으면 멈춤)

필요한 것: data/external/상가정보_충북_202606.csv(커밋하지 않음),
           .env.local의 VITE_VWORLD_KEY(키를 등록한 서비스 주소를 Referer로 보낸다).
"""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(io.open(os.path.join(ROOT, "data", "config", "buildings.json"), encoding="utf-8"))
AIRPORTS = json.load(io.open(os.path.join(ROOT, "data", "config", "airports.json"), encoding="utf-8"))
CACHE = os.path.join(ROOT, "data", "external", "wfs_cache")
OUT = os.path.join(ROOT, "public", "data", "buildings")

ENDPOINT = "https://api.vworld.kr/req/wfs"
REFERER = os.environ.get("VWORLD_REFERER", "https://airport-stay-monitor.vercel.app")
PAGE = 1000
CELL_LAT, CELL_LNG = 0.008, 0.01  # 약 0.9km 칸. 한 번에 1,000건이 꽉 차면 4등분한다
MAX_DEPTH = 5


def haversine(lat1, lng1, lat2, lng2):
    r, p = 6371.0088, math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def vworld_key():
    if os.environ.get("VITE_VWORLD_KEY"):
        return os.environ["VITE_VWORLD_KEY"].strip()
    path = os.path.join(ROOT, ".env.local")
    if os.path.exists(path):
        for line in io.open(path, encoding="utf-8"):
            if line.startswith("VITE_VWORLD_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    return None


# ── 범위 ──────────────────────────────────────────────

SCOPE = {s["cd"]: s for s in CFG["scope"]}
PROTECT = [a for a in AIRPORTS["airports"] if a.get("military_shared")]


def in_scope_pnu(pnu):
    """PNU(법정동 10자리 + 지번)로 범위 판단. 법정동 읍면동 코드 250 미만 = 동, 250~ = 읍, 310~ = 면(단양읍 250, 매포읍 253)."""
    if not pnu or len(pnu) < 10:
        return None
    s = SCOPE.get(pnu[:5])
    if not s:
        return None
    emd = pnu[5:8]
    if s["area"] == "all":
        return s["cd"]
    if s["area"] == "dong":
        return s["cd"] if emd < "250" else None
    if s["area"] == "emd":
        return s["cd"] if emd == s["emd_code"] else None
    return None


def in_scope_shop(r):
    s = SCOPE.get(r["시군구코드"])
    if not s:
        return None
    dong = r["행정동명"]
    if s["area"] == "all":
        return s["cd"]
    if s["area"] == "dong":
        return s["cd"] if dong.endswith("동") else None
    if s["area"] == "emd":
        return s["cd"] if dong == s["emd_name"] else None
    return None


def protected(lat, lng):
    for a in PROTECT:
        if haversine(lat, lng, a["lat"], a["lng"]) <= CFG["protect_km"]:
            return a["id"]
    return None


# ── 업소 ──────────────────────────────────────────────

def load_shops():
    path = os.path.join(ROOT, CFG["shops_file"])
    if not os.path.exists(path):
        raise SystemExit("상가(상권)정보 CSV가 없습니다: %s\n소상공인시장진흥공단_상가(상권)정보_20260630.zip에서 충북 파일을 풀어 넣으세요." % CFG["shops_file"])
    cats = set(CFG["categories"])
    shops, hidden = [], defaultdict(Counter)
    with io.open(path, encoding="utf-8-sig", newline="") as fp:
        for r in csv.DictReader(fp):
            if r["상권업종대분류명"] not in cats:
                continue
            cd = in_scope_shop(r)
            if not cd:
                continue
            try:
                lat, lng = float(r["위도"]), float(r["경도"])
            except ValueError:
                continue
            ap = protected(lat, lng)
            if ap:
                hidden[ap][r["상권업종대분류명"]] += 1  # 위치 없이 개수만
                continue
            name = r["상호명"].strip()
            if r["지점명"].strip():
                name += " " + r["지점명"].strip()
            shops.append({"cd": cd, "lat": lat, "lng": lng, "pnu": r["지번코드"], "cat": r["상권업종대분류명"],
                          "name": name, "bid": r["건물관리번호"]})
    return shops, hidden


def seed_cells(shops):
    """브이월드에 물을 칸: 업소 3곳 이상이 모인 건물관리번호나 숙박업소가 있는 곳."""
    by = defaultdict(list)
    for s in shops:
        by[s["bid"]].append(s)
    cells = set()
    for group in by.values():
        if len(group) >= CFG["min_shops"] or any(s["cat"] == "숙박" for s in group):
            s = group[0]
            cells.add((math.floor(s["lat"] / CELL_LAT), math.floor(s["lng"] / CELL_LNG)))
    return sorted(cells)


# ── 브이월드 WFS ─────────────────────────────────────

KEEP = ("ufid", "bld_nm", "grnd_flr", "pnu", "usability", "useapr_day")


def fetch(bbox, key, offline):
    """bbox = (서, 남, 동, 북). 응답은 캐시에 남긴다(같은 칸을 다시 묻지 않음)."""
    tag = "%.5f_%.5f_%.5f_%.5f" % bbox
    path = os.path.join(CACHE, hashlib.sha1(tag.encode()).hexdigest()[:16] + ".json")
    if os.path.exists(path):
        return json.load(io.open(path, encoding="utf-8"))
    if offline or not key:
        raise SystemExit("캐시에 없는 칸입니다(--offline 또는 키 없음): " + tag)
    params = {"SERVICE": "WFS", "REQUEST": "GetFeature", "VERSION": "2.0.0", "TYPENAME": "lt_c_bldginfo",
              "OUTPUT": "application/json", "SRSNAME": "EPSG:4326", "BBOX": "%.6f,%.6f,%.6f,%.6f" % bbox,
              "COUNT": str(PAGE), "KEY": key}
    url = ENDPOINT + "?" + urllib.parse.urlencode(params, safe=",:")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"Referer": REFERER})
            with urllib.request.urlopen(req, timeout=90) as r:
                raw = r.read().decode("utf-8", "replace")
            if not raw.lstrip().startswith("{"):
                raise RuntimeError("WFS 오류 응답: " + raw[:200].replace(key, "***"))
            feats = json.loads(raw).get("features") or []
            break
        except Exception as e:  # 일시 오류는 잠깐 쉬고 다시
            if attempt == 3:
                raise SystemExit("브이월드 WFS 실패(%s): %s" % (tag, str(e).replace(key, "***")))
            time.sleep(2 + attempt * 3)
    slim = [{"p": {k: (f.get("properties") or {}).get(k) for k in KEEP}, "g": f.get("geometry")} for f in feats]
    os.makedirs(CACHE, exist_ok=True)
    with io.open(path, "w", encoding="utf-8") as fp:
        json.dump({"bbox": tag, "full": len(feats) >= PAGE, "features": slim}, fp, ensure_ascii=False, separators=(",", ":"))
    return json.load(io.open(path, encoding="utf-8"))


def fetch_cell(cell, key, offline, stats):
    la, lo = cell
    out = []
    stack = [((lo * CELL_LNG, la * CELL_LAT, (lo + 1) * CELL_LNG, (la + 1) * CELL_LAT), 0)]
    while stack:
        bbox, depth = stack.pop()
        got = fetch(bbox, key, offline)
        stats["requests"] += 1
        if got["full"] and depth < MAX_DEPTH:
            w, s, e, n = bbox
            mx, my = (w + e) / 2, (s + n) / 2
            stack += [((w, s, mx, my), depth + 1), ((mx, s, e, my), depth + 1), ((w, my, mx, n), depth + 1), ((mx, my, e, n), depth + 1)]
            continue
        if got["full"]:
            stats["truncated"] += 1
        out.extend(got["features"])
    return out


# ── 기하 ──────────────────────────────────────────────

def polygons(geom):
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def ring_contains(ring, x, y):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-18) + xi:
            inside = not inside
        j = i
    return inside


def contains(polys, x, y):
    for poly in polys:
        if poly and ring_contains(poly[0], x, y) and not any(ring_contains(h, x, y) for h in poly[1:]):
            return True
    return False


def edge_m(lat, lng, polys):
    """점에서 건물 외곽선까지 거리(m). 좁은 범위라 평면 근사로 충분하다."""
    kx, ky = 111320 * math.cos(lat * math.pi / 180), 110540
    best = float("inf")
    for poly in polys:
        ring = poly[0]
        for i in range(len(ring) - 1):
            ax, ay = (ring[i][0] - lng) * kx, (ring[i][1] - lat) * ky
            bx, by = (ring[i + 1][0] - lng) * kx, (ring[i + 1][1] - lat) * ky
            dx, dy = bx - ax, by - ay
            t = max(0.0, min(1.0, -(ax * dx + ay * dy) / ((dx * dx + dy * dy) or 1e-12)))
            best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def round_geom(polys):
    out = []
    for poly in polys:
        rings = []
        for ring in poly:
            pts = []
            for x, y in ring:
                p = [round(x, 5), round(y, 5)]
                if not pts or pts[-1] != p:
                    pts.append(p)
            if len(pts) >= 4:
                rings.append(pts)
        if rings:
            out.append(rings)
    if not out:
        return None
    return {"type": "Polygon", "coordinates": out[0]} if len(out) == 1 else {"type": "MultiPolygon", "coordinates": out}


def centroid(polys):
    ring = polys[0][0]
    xs = [p[0] for p in ring[:-1]] or [ring[0][0]]
    ys = [p[1] for p in ring[:-1]] or [ring[0][1]]
    return sum(ys) / len(ys), sum(xs) / len(xs)


# ── 본체 ──────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    key = None if args.offline else vworld_key()
    if not args.offline and not key:
        raise SystemExit(".env.local에 VITE_VWORLD_KEY가 필요합니다(또는 --offline).")

    shops, hidden = load_shops()
    cells = seed_cells(shops)
    print("업소 %d곳(보호구역 제외), 물을 칸 %d개" % (len(shops), len(cells)))

    stats = Counter()
    raw = {}
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, feats in enumerate(ex.map(lambda c: fetch_cell(c, key, args.offline, stats), cells)):
            for f in feats:
                u = f["p"].get("ufid")
                if u and u not in raw:
                    raw[u] = f
            if (i + 1) % 50 == 0:
                print("  %d/%d칸 · 건물 %d동 · 요청 %d" % (i + 1, len(cells), len(raw), stats["requests"]))
    print("건물 %d동 · 요청 %d · 잘림 %d" % (len(raw), stats["requests"], stats["truncated"]))

    # 건물 목록 + 격자 색인
    blds, grid, by_pnu = [], defaultdict(list), defaultdict(list)
    G = 0.001
    for f in raw.values():
        polys = polygons(f["g"])
        if not polys or not polys[0]:
            continue
        xs = [p[0] for poly in polys for p in poly[0]]
        ys = [p[1] for poly in polys for p in poly[0]]
        b = {"p": f["p"], "polys": polys, "bbox": (min(xs), min(ys), max(xs), max(ys)), "shops": []}
        idx = len(blds)
        blds.append(b)
        for gx in range(int(math.floor(b["bbox"][0] / G)), int(math.floor(b["bbox"][2] / G)) + 1):
            for gy in range(int(math.floor(b["bbox"][1] / G)), int(math.floor(b["bbox"][3] / G)) + 1):
                grid[(gx, gy)].append(idx)
        if f["p"].get("pnu"):
            by_pnu[f["p"]["pnu"]].append(idx)

    how = Counter()
    for s in shops:
        hit = None
        for idx in grid.get((int(math.floor(s["lng"] / G)), int(math.floor(s["lat"] / G))), []):
            b = blds[idx]
            x0, y0, x1, y1 = b["bbox"]
            if x0 <= s["lng"] <= x1 and y0 <= s["lat"] <= y1 and contains(b["polys"], s["lng"], s["lat"]):
                hit = idx
                break
        if hit is not None:
            how["좌표"] += 1
        else:
            same = by_pnu.get(s["pnu"], [])
            best = None
            for idx in same:
                cy, cx = centroid(blds[idx]["polys"])
                d = haversine(s["lat"], s["lng"], cy, cx)
                if d <= 0.05 and (best is None or d < best[0]):
                    best = (d, idx)
            if best:
                hit = best[1]
                how["지번"] += 1
        if hit is None:
            gx0, gy0 = int(math.floor(s["lng"] / G)), int(math.floor(s["lat"] / G))
            near = None
            for gx in (gx0 - 1, gx0, gx0 + 1):
                for gy in (gy0 - 1, gy0, gy0 + 1):
                    for idx in grid.get((gx, gy), []):
                        d = edge_m(s["lat"], s["lng"], blds[idx]["polys"])
                        if d <= 15 and (near is None or d < near[0]):
                            near = (d, idx)
            if near:
                hit = near[1]
                how["15m 안"] += 1
        if hit is None:
            how["못 이음"] += 1
            continue
        blds[hit]["shops"].append(s)
    print("업소-건물 잇기:", dict(how))

    cls = CFG["classes"]
    order = {c: i for i, c in enumerate(CFG["categories"])}
    airport = next(a for a in AIRPORTS["airports"] if a["id"] == AIRPORTS["target"])
    by_cd = defaultdict(list)
    dropped = Counter()
    for b in blds:
        p = b["p"]
        use = (p.get("usability") or "").strip()
        n = Counter(s["cat"] for s in b["shops"])
        total = sum(n.values())
        if not (use in cls["lodging"] or total >= CFG["min_shops"]):
            continue
        cd = in_scope_pnu(p.get("pnu") or "")
        if not cd and b["shops"]:
            cd = Counter(s["cd"] for s in b["shops"]).most_common(1)[0][0]
        if not cd:
            dropped["범위 밖"] += 1
            continue
        if any(protected(y, x) for poly in b["polys"] for x, y in poly[0]):
            dropped["보호구역"] += 1
            continue
        geom = round_geom(b["polys"])
        if not geom:
            continue
        cy, cx = centroid(b["polys"])
        shops_sorted = sorted(b["shops"], key=lambda s: (order[s["cat"]], s["name"]))
        k = "lodging" if use in cls["lodging"] else "retail_food" if use in cls["retail_food"] else "other"
        ym = (p.get("useapr_day") or "").strip()
        by_cd[cd].append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": p["ufid"],
                "k": k,
                "use": CFG["use_names"].get(use) or ("기타" if use else None),
                "fl": p.get("grnd_flr") or None,
                "yr": int(ym[:4]) if len(ym) >= 4 and ym[:4].isdigit() and ym[:4] != "0000" else None,
                "nm": (p.get("bld_nm") or "").strip() or None,
                "n": [n.get(c, 0) for c in CFG["categories"]],
                "shops": [[s["name"], s["cat"]] for s in shops_sorted[: CFG["shop_list_max"]]],
                "km": round(haversine(cy, cx, airport["lat"], airport["lng"]), 1),
                "cy": round(cy, 5),
                "cx": round(cx, 5),
            },
        })
    print("남긴 건물:", {cd: len(v) for cd, v in sorted(by_cd.items())}, "뺀 건물:", dict(dropped))

    os.makedirs(OUT, exist_ok=True)
    areas = []
    for s in CFG["scope"]:
        feats = sorted(by_cd.get(s["cd"], []), key=lambda f: f["properties"]["id"])
        if not feats:
            continue
        with io.open(os.path.join(OUT, s["cd"] + ".json"), "w", encoding="utf-8") as fp:
            json.dump({"type": "FeatureCollection", "cd": s["cd"], "features": feats}, fp, ensure_ascii=False, separators=(",", ":"))
        xs = [f["properties"]["cx"] for f in feats]
        ys = [f["properties"]["cy"] for f in feats]
        # 바로 가기 지점: 건물이 가장 많이 모인 약 400m 칸의 가운데
        dense = Counter((round(f["properties"]["cy"] / 0.004), round(f["properties"]["cx"] / 0.005)) for f in feats).most_common(1)[0][0]
        pts = [f["properties"] for f in feats if (round(f["properties"]["cy"] / 0.004), round(f["properties"]["cx"] / 0.005)) == dense]
        areas.append({
            "cd": s["cd"],
            "label": s["label"],
            "file": s["cd"] + ".json",
            "count": len(feats),
            "kinds": dict(Counter(f["properties"]["k"] for f in feats)),
            "bbox": [round(min(xs) - 0.002, 4), round(min(ys) - 0.002, 4), round(max(xs) + 0.002, 4), round(max(ys) + 0.002, 4)],
            "focus": [round(sum(p["cy"] for p in pts) / len(pts), 4), round(sum(p["cx"] for p in pts) / len(pts), 4)],
        })
    index = {
        "collected": os.environ.get("BUILDINGS_COLLECTED") or date.today().isoformat(),
        "shops_period": CFG["shops_period"],
        "sources": CFG["sources"],
        "categories": CFG["categories"],
        "min_shops": CFG["min_shops"],
        "protect_km": CFG["protect_km"],
        "protected": [a["id"] for a in PROTECT],
        "hidden_shops": {k: dict(v) for k, v in sorted(hidden.items())},
        "match": dict(how),
        "areas": areas,
    }
    prev = os.path.join(OUT, "index.json")
    if os.path.exists(prev) and not os.environ.get("BUILDINGS_COLLECTED"):
        old = json.load(io.open(prev, encoding="utf-8"))
        # 캐시만으로 다시 만들면 수집일을 바꾸지 않는다
        if args.offline:
            index["collected"] = old.get("collected", index["collected"])
    with io.open(prev, "w", encoding="utf-8") as fp:
        json.dump(index, fp, ensure_ascii=False, indent=1)
    kb = sum(os.path.getsize(os.path.join(OUT, a["file"])) for a in areas) / 1024
    print("저장: public/data/buildings/ · %d동 · %.0fKB · 수집일 %s" % (sum(a["count"] for a in areas), kb, index["collected"]))


if __name__ == "__main__":
    main()
