# -*- coding: utf-8 -*-
"""공항 체류전환 지표 산식 (IND-01~06, 규칙 BR-D1~D6 · BR-I1~I6).

reference/compute_indicators.py(정답 구현)의 산식을 함수 단위로 나눴다. 표준 라이브러리만 쓴다.
규칙 ID는 기능명세서 「⑤ 비즈니스규칙」 시트를 따른다.

금액은 원, 방문자는 데이터랩 일자별 순방문자(연인원 추정치)다. 방문자는 시간·공간으로 합산하지 않고
월평균끼리만 나눈다(BR-D2). 카드 금액만 반기 합산한다(BR-I1).
"""
from __future__ import annotations

import csv
import math
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

YM_RE = re.compile(r"^\d{4}(0[1-9]|1[0-2])$")
HALF_RE = re.compile(r"^\d{4}H[12]$")


class DataError(Exception):
    """빌드를 멈춰야 하는 원천 오류. 메시지는 ④ 데이터정의의 검증 실패 메시지를 쓴다."""


class Log:
    """적재·검증 중 나온 경고를 모아 data_report로 내보낸다."""

    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, level: str, code: str, msg: str) -> None:
        self.items.append({"level": level, "code": code, "msg": msg})

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i["level"] == level)


# ── 기간 ─────────────────────────────────────────────────────────────

def half_months(half: str) -> list[str]:
    """'2026H1' → ['202601', …, '202606']"""
    if not HALF_RE.match(half):
        raise ValueError(f"반기 형식 오류: {half}")
    y, start = int(half[:4]), 1 if half[-1] == "1" else 7
    return [f"{y}{m:02d}" for m in range(start, start + 6)]


def month_range(start: str, end: str) -> list[str]:
    y, m = int(start[:4]), int(start[4:])
    out = []
    while f"{y}{m:02d}" <= end:
        out.append(f"{y}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def month_gaps(months) -> list[str]:
    """정렬된 월 목록에서 빠진 달."""
    ms = sorted(set(months))
    if not ms:
        return []
    have = set(ms)
    return [m for m in month_range(ms[0], ms[-1]) if m not in have]


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


# ── DAT-01 입국관광통계 ────────────────────────────────────────────────

class Arrivals:
    """arrivals[국적][공항열][월]. 없는 (국적, 월)은 None."""

    def __init__(self, table: dict, months: list[str], columns: list[str]):
        self.table = table
        self.months = months
        self.columns = columns

    def get(self, country: str, col: str, ym: str) -> int | None:
        row = self.table.get((country, ym))
        return None if row is None else row.get(col, 0)

    def total(self, country: str, col: str, months) -> int:
        return sum(self.get(country, col, m) or 0 for m in months)

    def total_all(self, col: str, months) -> int:
        ms = set(months)
        return sum(r.get(col, 0) for (_, ym), r in self.table.items() if ym in ms)

    @property
    def latest(self) -> str:
        return self.months[-1]


def load_arrivals(path: Path, region_map: dict, columns: list[str], log: Log) -> Arrivals:
    """BR-D5: 대륙 소계(…주)·교포·국제연합·기타·전체 행은 적재하지 않는다."""
    rows = read_csv(path)
    alias = region_map["country_alias"]
    ex = region_map["entry_exclude"]
    header = rows[0].keys() if rows else []
    missing_cols = [c for c in columns if c not in header]
    for c in missing_cols:
        log.add("warn", "DAT-01", f"공항 열 없음 → 0 처리: {c}")

    table: dict = {}
    excluded: Counter = Counter()
    summary_rows = blanks = dup = 0
    for r in rows:
        ym = (r.get("ym") or "").strip()
        name = (r.get("country") or "").strip()
        country = alias.get(name, name)
        if ym in ex["summary_ym"]:
            summary_rows += 1
            continue
        if not YM_RE.match(ym):
            raise DataError(f"기준월 형식 오류: {ym}")
        if country.endswith(ex["suffix"]) or country in ex["names"]:
            excluded[country] += 1
            continue
        vals = {}
        for c in columns:
            raw = r.get(c)
            if raw is None or raw.strip() == "":
                if c not in missing_cols:
                    blanks += 1
                vals[c] = 0
                continue
            try:
                v = float(raw)
            except ValueError:
                raise DataError(f"입국자 값 오류: {c} {ym}") from None
            if v < 0 or v != int(v):
                raise DataError(f"입국자 값 오류: {c} {ym}")
            vals[c] = int(v)
        key = (country, ym)
        if key in table:
            dup += 1
            continue
        table[key] = vals

    if excluded:
        detail = ", ".join(f"{k} {v}" for k, v in sorted(excluded.items()))
        log.add("info", "DAT-01", f"제외 대상 행 {sum(excluded.values())}건 ({detail})")
    if summary_rows:
        log.add("info", "DAT-01", f"기간 합계 행 {summary_rows}건 제외(소계·전체)")
    if blanks:
        log.add("warn", "DAT-01", f"공항 열 결측 {blanks}칸 → 0 처리")
    if dup:
        log.add("warn", "DAT-01", f"국가명 통일 후 중복 행 {dup}건 → 첫 행 유지")
    months = sorted({ym for _, ym in table})
    return Arrivals(table, months, columns)


# ── DAT-02~04 데이터랩 ────────────────────────────────────────────────

class Datalab:
    """vis·card: (level, region, cat, period) → 값, ind: (level, region, cat, sub, period) → 값."""

    def __init__(self) -> None:
        self.vis: dict = {}
        self.card: dict = {}
        self.ind: dict = {}
        self.rows = Counter()

    def regions(self, kind: str, level: str) -> set[str]:
        src = self.vis if kind == "vis" else self.card
        return {k[1] for k in src if k[0] == level}

    def periods(self, kind: str, level: str, region: str | None = None) -> list[str]:
        src = self.vis if kind == "vis" else self.card
        return sorted({k[3] for k in src if k[0] == level and (region is None or k[1] == region)})


def load_datalab(paths: list[Path], region_map: dict, log: Log) -> Datalab:
    """국가 표기 흔들림(터키/튀르키예 등)은 통일 표기를 우선하고, 별칭 행은 비어 있는 칸에만 채운다."""
    alias = region_map["country_alias"]
    sido = set(region_map["sido"])
    sgg = {s["region"] for s in region_map["sgg"]}
    dl = Datalab()
    unknown: Counter = Counter()
    bad = Counter()
    deferred = []

    def put(kind, key, value):
        target = {"vis": dl.vis, "card": dl.card, "ind": dl.ind}[kind]
        if key in target:
            return False
        target[key] = value
        return True

    for path in paths:
        for r in read_csv(path):
            level, kind = r.get("level", "").strip(), r.get("kind", "").strip()
            region, period = r.get("region", "").strip(), r.get("period", "").strip()
            cat, sub = r.get("cat", "").strip(), (r.get("sub") or "").strip()
            if level not in ("sido", "sgg") or kind not in ("vis", "card", "ind"):
                bad["level/kind"] += 1
                continue
            if (level == "sido" and region not in sido) or (level == "sgg" and region not in sgg):
                unknown[region] += 1
                continue
            if not (HALF_RE.match(period) if kind == "ind" else YM_RE.match(period)):
                bad["period"] += 1
                continue
            try:
                value = float(r.get("value", ""))
            except ValueError:
                bad["value"] += 1
                continue
            if value < 0:
                bad["value"] += 1
                continue
            dl.rows[(level, kind)] += 1
            canon = alias.get(cat, cat)
            if kind == "ind":
                key = (level, region, cat, sub, period)
            else:
                key = (level, region, canon, period)
            if canon != cat:
                deferred.append((kind, key, value))
            else:
                put(kind, key, value)

    dropped = sum(0 if put(kind, key, value) else 1 for kind, key, value in deferred)
    if deferred:
        log.add("info", "DAT-02", f"국가 표기 통일 {len(deferred)}행(터키→튀르키예 등), 통일 표기와 겹친 {dropped}행은 제외")
    for region, n in sorted(unknown.items()):
        log.add("warn", "DAT-02", f"알 수 없는 지역: {region} ({n}행 제외)")
    for what, n in sorted(bad.items()):
        log.add("warn", "DAT-02", f"형식 오류 {what} {n}행 제외")
    return dl


def corrected_card(dl: Datalab, gu_cities: dict, log: Log | None = None) -> tuple[dict, dict]:
    """BR-D1 시도 카드 보정. (region, cat, period) → 원.

    데이터랩 시도 카드에는 구 설치 시(청주 4구 등)가 빠져 있다. 해당 시의 구 시군구값을 더한다.
    반환: (보정값, 보정 전 시도값)
    """
    raw = defaultdict(float)
    for (level, region, cat, period), v in dl.card.items():
        if level == "sido":
            raw[(region, cat, period)] += v
    out = defaultdict(float, raw)
    have_sgg = dl.regions("card", "sgg")
    for city in gu_cities["cities"]:
        gus = set(city["gu"])
        present = gus & have_sgg
        if not present:
            if log:
                log.add("info", "BR-D1", f"{city['sido']}: {city['city']} 구 시군구 카드 미적재 → 보정 미적용")
            continue
        if present != gus and log:
            log.add("warn", "BR-D1", f"{city['sido']}: {city['city']} 구 일부만 적재({len(present)}/{len(gus)}) → 있는 구만 보정")
        for (level, region, cat, period), v in dl.card.items():
            if level == "sgg" and region in gus:
                out[(city["sido"], cat, period)] += v
    return dict(out), dict(raw)


def corrected_industry(dl: Datalab, gu_cities: dict, region: str) -> dict:
    """업종별 카드(반기)도 시도값에 구 설치 시가 빠져 있어 같은 방식으로 보정한다. period → {업종: 원}"""
    gus = set()
    for city in gu_cities["cities"]:
        if city["sido"] == region:
            gus |= set(city["gu"])
    out: dict = defaultdict(lambda: defaultdict(float))
    for (level, reg, cat, _sub, period), v in dl.ind.items():
        if (level == "sido" and reg == region) or (level == "sgg" and reg in gus):
            out[period][cat] += v
    return {p: dict(c) for p, c in sorted(out.items())}


def sido_visits(dl: Datalab) -> dict:
    """(region, cat, period) → 월 방문자. 방문자는 합산하지 않으므로 시도 행만 쓴다(BR-D2)."""
    return {(r, c, p): v for (lv, r, c, p), v in dl.vis.items() if lv == "sido"}


# ── IND-01·02 지표 ①② ────────────────────────────────────────────────

def monthly_ratio(num, den, min_den: int):
    """BR-I2: 월 입국이 min_den 미만이면 None(차트 선 끊김)."""
    if num is None or den is None or den < min_den:
        return None
    return num / den


def half_values(arr: Arrivals, card: dict, vis: dict, airport: dict, nat: str, half: str) -> dict:
    """BR-I1 ① = Σcard(h) ÷ Σarrivals(h), ② = 월평균 방문 ÷ 월평균 입국(방문자 합산 금지)."""
    ms = half_months(half)
    col, reg = airport["column"], airport["region"]
    a = arr.total(nat, col, ms)
    k = sum(card.get((reg, nat, m), 0.0) for m in ms)
    vs = [vis[(reg, nat, m)] for m in ms if (reg, nat, m) in vis]
    vis_mavg = statistics.mean(vs) if vs else None
    arr_mavg = a / len(ms)
    per = k / a if a else None
    ratio = vis_mavg / arr_mavg if (vis_mavg is not None and arr_mavg) else None
    return {
        "arrivals": a,
        "card": k,
        "vis_mavg": vis_mavg,
        "arr_mavg": arr_mavg,
        "per_arrival_spend": per,
        "visit_ratio": ratio,
        "vis_months": len(vs),
    }


def per_person_day(half: dict) -> float | None:
    """인·일당 카드소비 = ① ÷ ②. 화면에 보이는 값(① 정수, ② 소수 2자리)으로 나눈다(IND-06 AC: 14,427원)."""
    per, ratio = half.get("per_arrival_spend"), half.get("visit_ratio")
    if per is None or not ratio:
        return None
    r = round(ratio, 2)
    return round(per) / r if r else None


def scenario(n_arrivals: int, days: float, per_day_target: float, per_day_compare: float) -> dict:
    """BR-I5 체류 증가 시나리오. low = N×d×(①÷②)대상, high = N×d×(①÷②)비교공항. 카드 기준 하한값."""
    if not 0 <= days <= 2.0:
        raise ValueError("증가일은 0~2.0일")
    a = n_arrivals * days * per_day_target
    b = n_arrivals * days * per_day_compare
    return {"low": min(a, b), "high": max(a, b)}


# ── IND-03 V2 공항 연동 검정 ───────────────────────────────────────────

def pearson(x: list[float], y: list[float]) -> float | None:
    if len(x) < 3:
        return None
    mx, my = statistics.mean(x), statistics.mean(y)
    a = sum((i - mx) * (j - my) for i, j in zip(x, y))
    b = math.sqrt(sum((i - mx) ** 2 for i in x) * sum((j - my) ** 2 for j in y))
    return a / b if b else 0.0


def v2_test(arr: Arrivals, vis: dict, airport: dict, ref_col: str, nat: str,
            months: list[str], min_diff: float, min_months: int) -> dict:
    """BR-I3: 수준·전월차분 상관이 모두 지역공항 > 인천이고 차분 상관 ≥ min_diff면 채택.

    방문 자료가 없는 달은 빼고, 차분은 달력상 이웃한 두 달이 모두 있을 때만 잡는다.
    """
    col, reg = airport["column"], airport["region"]
    pts = [(m, arr.get(nat, col, m) or 0, arr.get(nat, ref_col, m) or 0, vis[(reg, nat, m)])
           for m in months if (reg, nat, m) in vis]
    n = len(pts)
    out = {"n": n, "window": [months[0], months[-1]] if months else None}
    if n < min_months:
        return {**out, "lv": None, "li": None, "dv": None, "di": None, "pass": False, "status": "보류"}
    x = [p[1] for p in pts]
    xi = [p[2] for p in pts]
    y = [p[3] for p in pts]
    idx = {m: i for i, m in enumerate(months)}
    pairs = [(pts[i - 1], pts[i]) for i in range(1, n) if idx[pts[i][0]] - idx[pts[i - 1][0]] == 1]
    dx = [b[1] - a[1] for a, b in pairs]
    dxi = [b[2] - a[2] for a, b in pairs]
    dy = [b[3] - a[3] for a, b in pairs]
    lv, li, dv, di = pearson(x, y), pearson(xi, y), pearson(dx, dy), pearson(dxi, dy)
    ok = v2_pass(lv, li, dv, di, min_diff)
    return {**out, "lv": lv, "li": li, "dv": dv, "di": di, "pass": ok, "status": "채택" if ok else "참고값"}


def v2_pass(lv, li, dv, di, min_diff: float) -> bool:
    if None in (lv, li, dv, di):
        return False
    return lv > li and dv > di and dv >= min_diff


# ── IND-04 Kitagawa 요인분해 ──────────────────────────────────────────

def kitagawa(arr: Arrivals, card: dict, airport: dict, nats: list[str], base: str, target: str) -> dict:
    """BR-I4: comp = Σ(s1−s0)(r0+r1)/2, rate_k = (s0+s1)/2 × (r1−r0). comp + Σrate = R1 − R0."""
    if len(nats) < 2:
        return {"skipped": True, "reason": "연동 검정을 통과한 국적이 2개 미만이라 요인분해를 생략합니다.", "nats": nats}
    col, reg = airport["column"], airport["region"]
    m0, m1 = half_months(base), half_months(target)
    k0 = {c: sum(card.get((reg, c, m), 0.0) for m in m0) for c in nats}
    k1 = {c: sum(card.get((reg, c, m), 0.0) for m in m1) for c in nats}
    n0 = {c: arr.total(c, col, m0) for c in nats}
    n1 = {c: arr.total(c, col, m1) for c in nats}
    if not all(n0.values()) or not all(n1.values()):
        return {"skipped": True, "reason": "비교 반기 입국자가 0인 국적이 있어 요인분해를 생략합니다.", "nats": nats}
    N0, N1 = sum(n0.values()), sum(n1.values())
    r0 = {c: k0[c] / n0[c] for c in nats}
    r1 = {c: k1[c] / n1[c] for c in nats}
    s0 = {c: n0[c] / N0 for c in nats}
    s1 = {c: n1[c] / N1 for c in nats}
    R0 = sum(s0[c] * r0[c] for c in nats)
    R1 = sum(s1[c] * r1[c] for c in nats)
    comp = sum((s1[c] - s0[c]) * (r0[c] + r1[c]) / 2 for c in nats)
    rate = {c: (s0[c] + s1[c]) / 2 * (r1[c] - r0[c]) for c in nats}
    return {
        "skipped": False,
        "airport": airport["id"],
        "region": reg,
        "nats": nats,
        "base": base,
        "target": target,
        "R0": R0,
        "R1": R1,
        "total": R1 - R0,
        "pct": (R1 / R0 - 1) * 100 if R0 else None,
        "comp": comp,
        "rate": rate,
        "r0": r0,
        "r1": r1,
        "s0": s0,
        "s1": s1,
        "residual": comp + sum(rate.values()) - (R1 - R0),
    }


# ── IND-05 시군구 방문당 카드소비 ─────────────────────────────────────

NAT_KEY = {"대만": "tw", "일본": "jp"}


def sgg_from_raw(dl: Datalab, region: str, nat: str | None, half: str) -> dict | None:
    """원천 시군구 행에서 국적(None이면 전체) 월평균 방문과 반기 카드합."""
    ms = half_months(half)
    if nat is None:
        vis_by_m = defaultdict(float)
        for (lv, r, _c, p), v in dl.vis.items():
            if lv == "sgg" and r == region and p in ms:
                vis_by_m[p] += v
        vs = list(vis_by_m.values())
        k = sum(v for (lv, r, _c, p), v in dl.card.items() if lv == "sgg" and r == region and p in ms)
    else:
        vs = [dl.vis[("sgg", region, nat, m)] for m in ms if ("sgg", region, nat, m) in dl.vis]
        k = sum(dl.card.get(("sgg", region, nat, m), 0.0) for m in ms)
    if not vs:
        return None
    return sgg_metric(statistics.mean(vs), k, len(ms))


def sgg_metric(visit_mavg: float | None, card: float | None, n_months: int = 6) -> dict:
    """방문 1회당 = 월평균 카드 ÷ 월평균 방문. 방문 0이면 None(지도 회색)."""
    per = (card / n_months) / visit_mavg if visit_mavg and card is not None else None
    return {"visit_mavg": visit_mavg, "card": card, "per_visit": per}


def sgg_from_table(row: dict, nat: str | None) -> dict:
    """충북_시군구_외국인_{반기}.csv(데이터랩 화면 시군구 값 정리표) 한 행."""
    key = "all" if nat is None else NAT_KEY[nat]
    v = float(row[f"{key}_visit_mavg"]) if row.get(f"{key}_visit_mavg") not in (None, "") else None
    c = float(row[f"{key}_card_mil"]) * 1e6 if row.get(f"{key}_card_mil") not in (None, "") else None
    out = sgg_metric(v, c)
    if nat is not None and row.get(f"{key}_card_per_visit") not in (None, ""):
        out["per_visit"] = float(row[f"{key}_card_per_visit"])
    return out


# ── 검증 보조 ────────────────────────────────────────────────────────

def easypay_effect(path: Path, region: str, nat: str, half: str, card: dict) -> dict | None:
    """V4 간편결제 합산 효과. 간편결제 값은 단위 미표기라 천원으로 추정한다(IS-06)."""
    ms = set(half_months(half))
    rows = [r for r in read_csv(path) if r.get("kind") == "국적별" and r.get("region") == region
            and r.get("cat") == nat and r.get("ym") in ms]
    if not rows:
        return None
    ep = sum(float(r["value"]) for r in rows) * 1000
    k = sum(card.get((region, nat, m), 0.0) for m in ms)
    return {"easypay_won": ep, "card_won": k, "effect": ep / k if k else None, "months": len(rows)}
