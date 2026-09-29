# -*- coding: utf-8 -*-
"""공항-권역 체류 전환 지표 재현 스크립트
입력(같은 폴더 또는 상위 Downloads):
  entry_airport_country_monthly_2023_2026.csv  (관광지식정보시스템 입국관광통계: 국적 × 월 × 공항)
  datalab_foreign_all_sido_sgg.csv             (데이터랩 외래객 지역별 방한현황: 방문·카드·업종, 시도·시군구)
실행: python3 compute_indicators.py
규칙: 방문자수는 월평균 비율만 사용(시간·공간 합산 금지), 카드 금액만 반기 합산.
      충북 카드 = 시도값(청주 누락) + 청주 4구 시군구값 (V3)
"""
import csv, os, statistics as st, math, collections
H = os.path.dirname(os.path.abspath(__file__))
def f(n):
    for d in (H, os.path.dirname(H)):
        p = os.path.join(d, n)
        if os.path.exists(p): return p
    raise FileNotFoundError(n)
A = list(csv.DictReader(open(f('entry_airport_country_monthly_2023_2026.csv'), encoding='utf-8-sig')))
D = list(csv.DictReader(open(f('datalab_foreign_all_sido_sgg.csv'), encoding='utf-8-sig')))
arr = {(r['country'], r['ym']): r for r in A}
def arrivals(c, ap, ms): return sum(int(float(arr[(c, m)][ap] or 0)) for m in ms if (c, m) in arr)
card = collections.defaultdict(float); vis = {}
CJ = ('청주상당', '청주서원', '청주흥덕', '청주청원')
for r in D:
    if r['kind'] == 'card':
        reg = r['region']
        if r['level'] == 'sgg':
            if reg not in CJ: continue
            reg = '충북'   # 청주 4구를 충북 시도값에 더함
        card[(reg, r['cat'], r['period'])] += float(r['value'])
    elif r['kind'] == 'vis' and r['level'] == 'sido':
        vis[(r['region'], r['cat'], r['period'])] = float(r['value'])
H1 = {'2025H1': ['2025%02d' % m for m in range(1, 7)], '2026H1': ['2026%02d' % m for m in range(1, 7)]}
PAIRS = [('충북', 'cjj', '청주'), ('대구', 'tae', '대구'), ('부산', 'pus', '김해'), ('제주', 'cju', '제주')]
print('== 지표① 입국 1인당 권역 카드소비(원), 지표② 방문 배율(월평균 방문 ÷ 월평균 입국) ==')
for reg, ap, nm in PAIRS:
    for c in ('대만', '일본'):
        row = []
        for h, ms in H1.items():
            a = arrivals(c, ap, ms); k = sum(card[(reg, c, m)] for m in ms)
            v = st.mean(vis.get((reg, c, m), 0) for m in ms); am = a / len(ms)
            row.append('%s 입국 %d / ① %s원 / ② %.2f' % (h, a, format(round(k / a) if a else 0, ','), v / am if am else 0))
        print(nm + '→' + reg, c, ' | '.join(row))
print('\n== V2 공항 연동 검정 (2024.01~2026.07, 수준·전월차분 상관, 지역공항 vs 인천) ==')
ms = ['%d%02d' % (y, m) for y in (2024, 2025, 2026) for m in range(1, 13) if not (y == 2026 and m > 7)]
def corr(x, y):
    mx, my = st.mean(x), st.mean(y); a = sum((i - mx) * (j - my) for i, j in zip(x, y))
    b = math.sqrt(sum((i - mx) ** 2 for i in x) * sum((j - my) ** 2 for j in y)); return a / b if b else 0
dif = lambda s: [s[i] - s[i - 1] for i in range(1, len(s))]
for reg, ap, nm in PAIRS:
    for c in ('대만', '일본', '중국', '베트남'):
        x = [arrivals(c, ap, [m]) for m in ms]; xi = [arrivals(c, 'icn', [m]) for m in ms]; y = [vis.get((reg, c, m), 0) for m in ms]
        lv, li, dv, di = corr(x, y), corr(xi, y), corr(dif(x), dif(y)), corr(dif(xi), dif(y))
        ok = lv > li and dv > di and dv >= 0.5
        print('%s %s 수준 %.2f(인천 %.2f) 차분 %.2f(인천 %.2f) → %s' % (nm, c, lv, li, dv, di, '채택' if ok else '제외'))
print('\n== Kitagawa 요인분해: 청주 입국 대만·일본, 충북 1인당 카드소비 2025H1→2026H1 ==')
k0 = {c: sum(card[('충북', c, m)] for m in H1['2025H1']) for c in ('대만', '일본')}
k1 = {c: sum(card[('충북', c, m)] for m in H1['2026H1']) for c in ('대만', '일본')}
n0 = {c: arrivals(c, 'cjj', H1['2025H1']) for c in k0}; n1 = {c: arrivals(c, 'cjj', H1['2026H1']) for c in k0}
N0, N1 = sum(n0.values()), sum(n1.values())
r0 = {c: k0[c] / n0[c] for c in k0}; r1 = {c: k1[c] / n1[c] for c in k0}
s0 = {c: n0[c] / N0 for c in k0}; s1 = {c: n1[c] / N1 for c in k0}
R0 = sum(s0[c] * r0[c] for c in k0); R1 = sum(s1[c] * r1[c] for c in k0)
print('가중 1인당 %d → %d (%+d, %+.1f%%)' % (R0, R1, R1 - R0, (R1 / R0 - 1) * 100))
print('구성효과 %+d' % sum((s1[c] - s0[c]) * (r0[c] + r1[c]) / 2 for c in k0))
for c in k0: print('%s 1인당 변화효과 %+d (%d → %d)' % (c, (s0[c] + s1[c]) / 2 * (r1[c] - r0[c]), r0[c], r1[c]))
