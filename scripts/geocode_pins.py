# -*- coding: utf-8 -*-
"""대만 타깃 콘텐츠 지점 좌표 조회(1회용, 빌드 시). 실행 중에는 외부 API를 부르지 않는다.

공사 타이베이지사 2026 대만 「중부관광의해」 충북 선정 콘텐츠 6곳을 V-World 검색 API(장소)로 한 번 찾아
data/config/tw_pins.json에 고정한다. 여러 곳에서 열리는 콘텐츠는 「대표 지점」으로 표시한다.
좌표는 사람이 지도에서 확인한 뒤 verified_on(확인일)을 적는다 — 그 전에는 화면에 「좌표 확인 전」으로 보인다.

실행: python scripts/geocode_pins.py   (.env.local의 VITE_VWORLD_KEY 사용)
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "config" / "tw_pins.json"

# (콘텐츠명, 데이터랩 시군구, 검색어, 대표 지점 여부, 주소에 들어 있어야 하는 말)
CONTENTS = [
    ("육거리시장", "청주상당", "육거리종합시장", False, "청주시 상당구"),
    ("충주중앙탑공원", "충주", "중앙탑공원", False, "충주시"),
    ("만천하스카이워크", "단양", "만천하스카이워크", False, "단양군"),
    ("단양 체험콘텐츠", "단양", "단양 패러글라이딩", True, "단양군"),
    ("제천 약채락 맛기행", "제천", "약채락", True, "제천시"),
    ("음성품바축제", "음성", "설성공원", True, "음성군"),
]


def key() -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("VITE_VWORLD_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(".env.local에 VITE_VWORLD_KEY가 없습니다")


def search(q: str, k: str) -> list[dict]:
    qs = urllib.parse.urlencode({"service": "search", "request": "search", "version": "2.0", "crs": "EPSG:4326",
                                 "size": 10, "page": 1, "query": q, "type": "place", "format": "json",
                                 "errorformat": "json", "key": k})
    req = urllib.request.Request(f"https://api.vworld.kr/req/search?{qs}",
                                 headers={"Referer": "https://airport-stay-monitor.vercel.app/"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.load(r)
    res = d.get("response", {})
    if res.get("status") != "OK":
        return []
    return res.get("result", {}).get("items", [])


def main() -> int:
    k = key()
    old = {p["name"]: p for p in json.loads(OUT.read_text(encoding="utf-8"))["pins"]} if OUT.exists() else {}
    pins = []
    for name, region, q, rep, must in CONTENTS:
        items = search(q, k)
        hit = next((i for i in items if must in ((i.get("address") or {}).get("road") or "") + ((i.get("address") or {}).get("parcel") or "")), None)
        if not hit:
            print(f"[못 찾음] {name} ← {q}", file=sys.stderr)
            return 1
        addr = (hit.get("address") or {}).get("road") or (hit.get("address") or {}).get("parcel")
        lat, lng = round(float(hit["point"]["y"]), 5), round(float(hit["point"]["x"]), 5)
        prev = old.get(name, {})
        # 사람이 확인한 좌표는 바뀌지 않았을 때만 확인일을 유지한다
        verified = prev.get("verified_on") if (prev.get("lat"), prev.get("lng")) == (lat, lng) else None
        pins.append({"name": name, "region": region, "representative": rep, "place": hit.get("title"), "address": addr,
                     "lat": lat, "lng": lng, "query": q, "looked_up_on": date.today().isoformat(), "verified_on": verified})
        print(f"{name:<12} {'(대표) ' if rep else ''}{hit.get('title')} · {addr} · {lat}, {lng}")
    OUT.write_text(json.dumps({
        "_doc": "공사 타이베이지사 2026 대만 「중부관광의해」 충북 선정 콘텐츠(2026 요즘데세 2차 자료집). 좌표는 V-World 장소 검색으로 1회 조회(scripts/geocode_pins.py). "
                "verified_on은 사람이 지도에서 확인한 날짜 — 비어 있으면 화면에 「좌표 확인 전」 표시.",
        "source": "한국관광공사 타이베이지사 2026 대만 「중부관광의해」 충북 선정 콘텐츠(요즘데세 2차 자료집)",
        "pins": pins}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"→ {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
