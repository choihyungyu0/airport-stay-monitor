import { fmt, fmtHalf, signed } from './format'
import type { Airport, Decomposition, Indicators, SggData, SggItem } from './types'

// 섹션마다 "질문 → 답 한 문장"을 데이터에서 만든다. 국적·반기가 바뀌어도 문장이 사실과 맞게 따라간다.

/** 2.053 → "2.1배", 2.0 → "2배" */
export const times = (r: number): string => `${Math.round(r * 10) / 10}배`

export const iata = (a: Airport): string => a.id.toUpperCase()

export interface Headline {
  label: string
  line1: string
  line2: string
  sub: string
}

export function headline(data: Indicators, nat: string): Headline | null {
  const t = data.airports.find((a) => a.id === data.target)
  const { base, target } = data.halves
  const h1 = t?.nat[nat]?.halves?.[target]
  const h0 = t?.nat[nat]?.halves?.[base]
  if (!t || !h1?.per_arrival_spend || !h0?.per_arrival_spend || !h0.arrivals) return null

  const r = h1.arrivals / h0.arrivals
  const line1 =
    r >= 1.5 ? `입국은 ${times(r)}로,`
    : r > 1.03 ? `입국은 ${Math.round((r - 1) * 100)}% 늘었는데,`
    : r < 0.97 ? `입국은 ${Math.round((1 - r) * 100)}% 줄었고,`
    : '입국은 그대로이고,'
  const p = h1.per_arrival_spend / h0.per_arrival_spend - 1
  const line2 =
    Math.abs(p) < 0.03 ? '1인당 소비는 그대로.'
    : p < 0 ? `1인당 소비는 ${Math.round(-p * 100)}% 줄었다.`
    : `1인당 소비는 ${Math.round(p * 100)}% 늘었다.`

  // 비교 대상: 연동 검정을 통과한 다른 공항 중 1인당 소비가 가장 큰 곳
  const best = data.airports
    .filter((a) => a.id !== t.id && a.nat[nat]?.status === '채택')
    .map((a) => ({ a, per: a.nat[nat]?.halves?.[target]?.per_arrival_spend ?? 0 }))
    .sort((x, y) => y.per - x.per)[0]
  let sub = `${t.name}공항 ${nat} 입국자가 ${t.region}에서 쓴 카드소비는 1인당 ${fmt(h1.per_arrival_spend)}원입니다.`
  if (best && best.per > h1.per_arrival_spend * 1.2) {
    sub += ` ${best.a.name}공항 입국자는 ${best.a.region}에서 ${times(best.per / h1.per_arrival_spend)}인 ${fmt(best.per)}원을 씁니다.`
  }
  return { label: `${iata(t)} → ${t.region} · ${fmtHalf(target)} · ${nat} 입국자`, line1, line2, sub }
}

export interface MapStory {
  visitTop: SggItem
  spendTop: SggItem
  ratio: number | null
  title: string
}

/** 방문이 가장 많은 곳과, 방문이 어느 정도(최다의 10% 이상) 있는 곳 중 1회당 소비가 가장 큰 곳 */
export function mapStory(sgg: SggData, nat: string): MapStory | null {
  const items = sgg.items.filter((i) => (i.nat[nat]?.visit_mavg ?? 0) > 0)
  if (!items.length) return null
  const v = (i: SggItem) => i.nat[nat].visit_mavg ?? 0
  const p = (i: SggItem) => i.nat[nat].per_visit ?? 0
  const visitTop = items.reduce((a, b) => (v(b) > v(a) ? b : a))
  const spendTop = items.filter((i) => v(i) >= v(visitTop) * 0.1).reduce((a, b) => (p(b) > p(a) ? b : a))
  const ap = visitTop.cd === sgg.airport_cd ? '(공항)' : ''
  const ratio = p(visitTop) ? p(spendTop) / p(visitTop) : null
  const title =
    visitTop.cd === spendTop.cd
      ? `방문 최다·방문 1회당 소비 최대 ${visitTop.name}${ap} ${fmt(v(visitTop))}명/월 · ${fmt(p(visitTop))}원`
      : `방문 최다 ${visitTop.name}${ap} ${fmt(v(visitTop))}명/월 · 방문 1회당 소비 최대 ${spendTop.name} ${fmt(p(spendTop))}원(${visitTop.name}의 ${ratio ? times(ratio) : '–'})`
  return { visitTop, spendTop, ratio, title }
}

export interface DecompRow {
  key: string
  label: string
  sub: string
  value: number
  lead: boolean
}

export function decompRows(d: Extract<Decomposition, { skipped: false }>): DecompRow[] {
  const rows: DecompRow[] = [
    {
      key: 'comp',
      label: '국적 구성 변화',
      sub: d.nats.map((c) => `${c} ${(d.s0[c] * 100).toFixed(1)}→${(d.s1[c] * 100).toFixed(1)}%`).join(' · '),
      value: d.comp,
      lead: false,
    },
    ...d.nats.map((c) => ({
      key: c,
      label: `${c} 1인당 소비 변화`,
      sub: `${fmt(d.r0[c])} → ${fmt(d.r1[c])}원`,
      value: d.rate[c],
      lead: false,
    })),
  ]
  // 전체 변화와 같은 방향으로 가장 크게 민 요인을 강조한다(없으면 절댓값 최대).
  const same = rows.filter((r) => Math.sign(r.value) === Math.sign(d.total))
  const pool = same.length ? same : rows
  const lead = pool.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a))
  lead.lead = true
  return rows
}

/** "무엇이 끌어내렸나"(또는 끌어올렸나)의 답 한 문장 */
export function decompTitle(d: Extract<Decomposition, { skipped: false }>): string {
  const lead = decompRows(d).find((r) => r.lead)!
  const what = lead.key === 'comp' ? '국적 구성 변화' : `${lead.key} 입국자의 1인당 소비 ${lead.value < 0 ? '감소' : '증가'}`
  return `${what}(${signed(lead.value)}원)입니다.`
}

export const decompQuestion = (d: Decomposition): string =>
  !d.skipped && d.total > 0 ? '무엇이 끌어올렸나' : '무엇이 끌어내렸나'

export function decompCaption(d: Extract<Decomposition, { skipped: false }>): string {
  const pct = `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : ''}${Math.abs(d.pct).toFixed(1)}%`
  return `${d.nats.join('·')} 합산 입국 1인당 카드소비 ${fmt(d.R0)}원 → ${fmt(d.R1)}원(${signed(d.total)}원, ${pct}). 국적 구성 변화와 국적별 1인당 변화로 나눈 값입니다.`
}

/** 효과 계산 제목: "체류 0.5일 증가 시" */
export const daysPhrase = (d: number): string => `체류 ${d.toFixed(1)}일 증가 시`

/** 첫 화면 비교 한 줄: "청주 입국 대만인 1인당 충북 카드소비는 김해→부산의 8.4%, 체류는 김해의 47%" */
export function compareLine(data: Indicators, nat: string): string | null {
  const t = data.airports.find((a) => a.id === data.target)
  const h = t?.nat[nat]?.halves?.[data.halves.target]
  if (!t || !h?.per_arrival_spend || !h.visit_ratio) return null
  const best = data.airports
    .filter((a) => a.id !== t.id && a.nat[nat]?.status === '채택')
    .map((a) => ({ a, h: a.nat[nat]!.halves![data.halves.target] }))
    .sort((x, y) => (y.h.per_arrival_spend ?? 0) - (x.h.per_arrival_spend ?? 0))[0]
  if (!best?.h.per_arrival_spend || !best.h.visit_ratio) return null
  const pct = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`
  return `${t.name} 입국 ${nat}인 1인당 ${t.region} 카드소비는 ${best.a.name}→${best.a.region}의 ${pct((h.per_arrival_spend / best.h.per_arrival_spend) * 100)}, 체류는 ${best.a.name}의 ${pct((h.visit_ratio / best.h.visit_ratio) * 100)}`
}
