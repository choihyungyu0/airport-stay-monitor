# -*- coding: utf-8 -*-
"""시도 경계 추출(1회용). 공항 권역 강조(지도 탭 행 클릭)에 쓰는 시도 윤곽만 뽑아 data/raw에 둔다.

입력: 통계청 SGIS 「행정구역 경계」 묶음 zip(sgis_86548_bnd_all_2025_2Q.zip) — 안의 bnd_sido_00_2025_2Q.zip
출력: data/raw/시도_경계_EPSG5179.geojson (airports.json 권역의 시도만, 400m 단순화·2km² 미만 섬 제외, EPSG:5179 그대로)
실행: python scripts/extract_sido.py <SGIS 묶음 zip 경로>

경계는 해마다 바뀌지 않으므로 월 갱신(build_data.py)에서는 다시 돌리지 않는다.
"""
import io
import json
import sys
import tempfile
import zipfile
from pathlib import Path

import shapefile  # pyshp

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import load_config, ring_centroid, simplify  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "시도_경계_EPSG5179.geojson"
TOLERANCE_M = 400
MIN_AREA_M2 = 2_000_000  # 2km² 미만 섬은 권역 윤곽 강조에 필요 없어 뺀다


def main(bundle: str) -> int:
    cfg = load_config()
    want = {cfg["region_map"]["sido_codes"][a["region"]]: a["region"] for a in cfg["airports"]["airports"]
            if a["region"] in cfg["region_map"]["sido_codes"]}
    with zipfile.ZipFile(bundle) as outer:
        inner_name = next(n for n in outer.namelist() if n.startswith("bnd_sido"))
        inner = zipfile.ZipFile(io.BytesIO(outer.read(inner_name)))
        with tempfile.TemporaryDirectory() as tmp:
            inner.extractall(tmp)
            shp = next(Path(tmp).glob("*.shp"))
            cpg = shp.with_suffix(".cpg")
            enc = cpg.read_text(encoding="ascii").strip().lower() if cpg.exists() else "cp949"
            enc = "utf-8" if enc in ("utf-8", "utf8", "65001") else "cp949"
            r = shapefile.Reader(str(shp), encoding=enc)
            names = [f[0] for f in r.fields[1:]]
            feats = []
            for sr in r.iterShapeRecords():
                rec = dict(zip(names, sr.record))
                cd = str(rec.get("SIDO_CD"))
                if cd not in want:
                    continue
                geo = sr.shape.__geo_interface__
                polys = geo["coordinates"] if geo["type"] == "MultiPolygon" else [geo["coordinates"]]
                out = []
                for poly in polys:
                    rings = [simplify([tuple(p[:2]) for p in ring], TOLERANCE_M) for ring in poly]
                    # 단순화 뒤 너무 작은 섬(4점 미만 고리·2km² 미만)은 버린다
                    if len(rings[0]) >= 4 and ring_centroid(rings[0])[2] >= MIN_AREA_M2:
                        out.append([[[round(x, 1), round(y, 1)] for x, y in ring] for ring in rings if len(ring) >= 4])
                feats.append({"type": "Feature", "properties": {"sgis_cd": cd, "name": want[cd]},
                              "geometry": {"type": "MultiPolygon", "coordinates": out}})
            r.close()
    missing = set(want) - {f["properties"]["sgis_cd"] for f in feats}
    if missing:
        print("시도 경계 없음:", missing, file=sys.stderr)
        return 1
    OUT.write_text(json.dumps({"type": "FeatureCollection",
                               "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::5179"}},
                               "features": sorted(feats, key=lambda f: f["properties"]["sgis_cd"])},
                              ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{OUT.name}: {len(feats)}개 시도 · {OUT.stat().st_size:,}B")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
