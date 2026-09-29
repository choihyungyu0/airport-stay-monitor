import { fmt, fmtEok, fmtHalf, fmtRatio, fmtYm, growthPct } from './format'
import type { ScenarioResult } from './scenario'
import { decompRows, mapStory, times } from './story'
import type { Airport, HalfValues, Indicators, Meta, SggData } from './types'

// 보고 문안(개조식). 한글 문서에 그대로 붙여 넣도록 □ ○ - ※ 기호와 들여쓰기를 쓴다.
// 모든 숫자는 산출 JSON에서 바로 가져오므로 화면 값과 어긋나지 않는다.

const sgn = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}%`
const monthName = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`

export function sourceLine(meta: Meta | null): string {
  const a = meta?.asof
  const when = a?.arrivals_latest ? `입국 ${fmtYm(a.arrivals_latest)}까지, 데이터랩 ${a.datalab_extract ?? fmtYm(a.datalab_latest)} 추출` : '기준일 확인 필요'
  return `※ 자료: 한국관광 데이터랩 외래객 지역별 방한현황, 관광지식정보시스템 입국관광통계(${when})`
}

const CARD_NOTE = '※ 카드소비는 외국 발행 신용카드 결제분으로 현금·여행사 선결제가 빠진 하한값'

export interface MonthValue {
  ym: string
  yoy: string | null
  arr: number | null
  arrYoy: number | null
  ratio: number | null
  ratioYoy: number | null
  per: number | null
  perYoy: number | null
  card: number | null
  cardYoy: number | null
}

/** 최근 달과 전년 같은 달 값. 월별 값은 방향 확인용이다(BR-I2). */
export function latestMonth(data: Indicators, airport: Airport, nat: string): MonthValue | null {
  const mo = airport.nat[nat]?.monthly
  if (!mo) return null
  const i = data.months.length - 1
  const ym = data.months[i]
  const j = data.months.indexOf(`${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`)
  const at = <T,>(arr: (T | null)[], k: number) => (k >= 0 ? arr[k] ?? null : null)
  return {
    ym,
    yoy: j >= 0 ? data.months[j] : null,
    arr: at(mo.arr, i),
    arrYoy: at(mo.arr, j),
    ratio: at(mo.ratio, i),
    ratioYoy: at(mo.ratio, j),
    per: at(mo.per, i),
    perYoy: at(mo.per, j),
    card: at(mo.card, i),
    cardYoy: at(mo.card, j),
  }
}

const target = (data: Indicators) => data.airports.find((a) => a.id === data.target)!

function halves(data: Indicators, a: Airport, nat: string): [HalfValues, HalfValues] | null {
  const h = a.nat[nat]?.halves
  const h1 = h?.[data.halves.target]
  const h0 = h?.[data.halves.base]
  return h1 && h0 ? [h1, h0] : null
}

/** 입국 증감: 1.5배 이상이면 "2.1배", 아니면 증감률 */
function arrivalsChange(h1: HalfValues, h0: HalfValues): string {
  const r = h1.arrivals / h0.arrivals
  return r >= 1.5 ? `전년 동기의 ${times(r)}` : `전년 동기 대비 ${sgn((r - 1) * 100)}`
}

/** 1인당 소비 변화: ±3% 안이면 "전년 수준" */
function perChange(h1: HalfValues, h0: HalfValues, sep = '('): string {
  const p = (h1.per_arrival_spend! / h0.per_arrival_spend! - 1) * 100
  if (Math.abs(p) >= 3) return `전년 동기 대비 ${sgn(p)}`
  return sep === '(' ? `전년 수준(${sgn(p, 1)})` : `전년 수준, ${sgn(p, 1)}`
}

/** 현황 한 줄(첫 화면·보고서 첫 문장) */
export function summaryLine(data: Indicators, nat: string): string | null {
  const t = target(data)
  const hv = halves(data, t, nat)
  if (!hv || !hv[0].per_arrival_spend || !hv[1].per_arrival_spend) return null
  const [h1, h0] = hv
  return `${fmtHalf(data.halves.target)} ${t.name}공항 ${nat} 입국 ${fmt(h1.arrivals)}명(${arrivalsChange(h1, h0)}), 입국 1인당 ${t.region} 카드소비 ${fmt(h1.per_arrival_spend)}원(${perChange(h1, h0, ',')}), 체류 ${fmtRatio(h1.visit_ratio)}인·일(전년 ${fmtRatio(h0.visit_ratio)}).`
}

/** 월간 동향: 최근 달 + 반기 누계, 설정된 국적 전부 */
export function monthlyReport(data: Indicators, meta: Meta | null): string {
  const t = target(data)
  const nats = data.nationalities.filter((n) => t.nat[n]?.monthly)
  const ms = nats.map((n) => [n, latestMonth(data, t, n)!] as const)
  const ym = ms[0]?.[1].ym ?? data.months[data.months.length - 1]
  const yoyPct = (a: number | null, b: number | null) => {
    const g = a != null && b ? growthPct(a, b) : null
    return g == null ? '' : `(전년 동월 대비 ${sgn(g)})`
  }
  const L: string[] = []
  L.push(`□ ${t.name}공항 외래객 ${t.region} 체류·소비 동향(${monthName(ym)})`)
  L.push('')
  L.push(` ○ 입국: ${ms.map(([n, m]) => `${n} ${fmt(m.arr)}명${yoyPct(m.arr, m.arrYoy)}`).join(', ')}`)
  L.push(` ○ 체류: 입국 1인당 ${t.region} 체류 인·일 ${ms.map(([n, m]) => `${n} ${fmtRatio(m.ratio)}(전년 동월 ${fmtRatio(m.ratioYoy)})`).join(', ')}`)
  L.push(` ○ 소비: 입국 1인당 ${t.region} 카드소비 ${ms.map(([n, m]) => `${n} ${fmt(m.per)}원(전년 동월 ${fmt(m.perYoy)}원)`).join(', ')}`)
  L.push('   - 월별 값은 입국자 수에 따라 크게 흔들리므로 방향 확인용이며, 판단은 반기 값으로 함')
  L.push('')
  L.push(`□ ${fmtHalf(data.halves.target)} 누계(판단 기준)`)
  for (const n of nats) {
    const hv = halves(data, t, n)
    if (!hv) continue
    const [h1, h0] = hv
    const g = growthPct(h1.arrivals, h0.arrivals)
    L.push(
      ` ○ ${n}: 입국 ${fmt(h1.arrivals)}명(전년 동기 대비 ${g == null ? '–' : sgn(g)}), 1인당 카드소비 ${fmt(h1.per_arrival_spend)}원(전년 동기 ${fmt(h0.per_arrival_spend)}원), 체류 ${fmtRatio(h1.visit_ratio)}인·일(${fmtRatio(h0.visit_ratio)})`,
    )
  }
  L.push('')
  L.push(sourceLine(meta))
  L.push(CARD_NOTE)
  return L.join('\n')
}

/** 반기 분석: 현황·공항 비교·권역 내·변화 요인·체류 효과 */
export function halfReport(data: Indicators, sgg: SggData, meta: Meta | null, nat: string, effect: ScenarioResult | null): string {
  const t = target(data)
  const hv = halves(data, t, nat)
  const L: string[] = []
  L.push(`□ ${t.name}공항 입국 ${nat}인의 ${t.region} 체류·소비 분석(${fmtHalf(data.halves.target)})`)
  L.push('')
  if (hv && hv[0].per_arrival_spend && hv[1].per_arrival_spend) {
    const [h1, h0] = hv
    L.push(` ○ (현황) 입국 ${fmt(h1.arrivals)}명으로 ${arrivalsChange(h1, h0)}, 입국 1인당 ${t.region} 카드소비는 ${fmt(h1.per_arrival_spend)}원으로 ${perChange(h1, h0)}`)
    const others = data.airports
      .filter((a) => a.id !== t.id && a.nat[nat]?.status === '채택')
      .map((a) => ({ a, per: a.nat[nat]!.halves![data.halves.target].per_arrival_spend ?? 0 }))
      .sort((x, y) => y.per - x.per)
    if (others.length) {
      L.push(
        ` ○ (비교) 같은 산식으로 ${others.map(({ a, per }) => `${a.name}공항 입국자의 ${a.region} 소비 ${fmt(per)}원(${times(per / h1.per_arrival_spend!)})`).join(', ')}`,
      )
    }
  }
  const st = mapStory(sgg, nat)
  if (st && st.visitTop.cd !== st.spendTop.cd) {
    const v = st.visitTop.nat[nat]
    const ap = st.visitTop.cd === sgg.airport_cd ? '공항 소재, ' : ''
    L.push(
      ` ○ (권역 내) 방문은 ${st.visitTop.name}(${ap}월평균 ${fmt(v.visit_mavg)}명)에 몰리나 방문 1회당 소비는 ${fmt(v.per_visit)}원이고, ${st.spendTop.name}는 ${fmt(st.spendTop.nat[nat].per_visit)}원으로 ${st.ratio ? times(st.ratio) : ''}`,
    )
  }
  const d = data.decomposition
  if (!d.skipped) {
    const lead = decompRows(d).find((r) => r.lead)!
    const what = lead.key === 'comp' ? '국적 구성 변화' : `${lead.key} 입국자의 1인당 소비 ${lead.value < 0 ? '감소' : '증가'}`
    L.push(
      ` ○ (변화 요인) ${d.nats.join('·')} 합산 1인당 카드소비 ${fmt(d.R0)}원 → ${fmt(d.R1)}원(${d.total < 0 ? '−' : '+'}${fmt(Math.abs(d.total))}원) 중 ${what}가 ${lead.value < 0 ? '−' : '+'}${fmt(Math.abs(lead.value))}원`,
    )
  }
  if (effect) {
    L.push(` ○ (체류 효과) 체류가 ${effect.days.toFixed(1)}일 늘면 추가 카드소비 ${fmtEok(effect.low)}~${fmtEok(effect.high)} 원(반기 입국 기준, 하한값)`)
  }
  L.push('')
  L.push(sourceLine(meta))
  L.push(CARD_NOTE)
  return L.join('\n')
}

/** 사업 효과 산출 근거 */
export function effectReport(data: Indicators, nat: string, r: ScenarioResult, compareId: string, arrivalsFromInput: boolean, budgetEok: number | null): string {
  const t = target(data)
  const c = data.airports.find((a) => a.id === compareId)
  const L: string[] = []
  L.push('□ 체류 연장 시 추가 카드소비 효과(추정)')
  L.push('')
  L.push(' ○ 산식: 대상 입국자 × 체류 증가일 × 입국자 인·일당 카드소비')
  L.push(
    ` ○ ${t.name}공항 ${nat} 입국 ${fmt(r.arrivals)}명${arrivalsFromInput ? '(입력값)' : `(${fmtHalf(data.halves.target)} 실적)`} × ${r.days.toFixed(1)}일 × ${fmt(r.perDayTarget)}~${fmt(r.perDayCompare)}원 = ${fmtEok(r.low)}~${fmtEok(r.high)} 원`,
  )
  L.push(`   - 하한: ${t.name}공항 입국자의 현재 ${t.region} 인·일당 카드소비 ${fmt(r.perDayTarget)}원(${fmtHalf(data.halves.target)})`)
  if (c) L.push(`   - 상한: ${c.name}공항 입국자의 ${c.region} 인·일당 카드소비 ${fmt(r.perDayCompare)}원(같은 기간${r.compareIsReference ? ', 참고값' : ''})`)
  if (budgetEok && budgetEok > 0) {
    L.push(` ○ 사업비 ${budgetEok.toLocaleString('ko-KR')}억 원 대비 추가 소비 ${(r.low / (budgetEok * 1e8)).toFixed(1)}~${(r.high / (budgetEok * 1e8)).toFixed(1)}배`)
  }
  L.push('')
  L.push('※ 인·일당 카드소비 = 입국 1인당 권역 카드소비 ÷ 입국 1인당 권역 체류 인·일(한국관광 데이터랩)')
  L.push(CARD_NOTE)
  return L.join('\n')
}
