import { fmt, fmtEok, fmtHalf, fmtRatio, fmtYm, growthPct } from './format'
import type { ScenarioResult } from './scenario'
import { decompRows, mapStory, times } from './story'
import type { Airport, HalfValues, Indicators, Meta, SggData } from './types'

// 보고 문안(개조식). 문서 한 건을 구조(제목·본문 줄·주석·표)로 만들고,
// 복사용 텍스트(renderText)와 한글 파일(hwpx.ts)이 같은 구조에서 나온다 — 둘의 숫자가 어긋날 수 없다.
// 모든 숫자는 산출 JSON에서 바로 가져온다.

export interface ReportTable {
  caption: string
  header: string[]
  rows: string[][]
}

export interface ReportDoc {
  title: string
  meta: string
  lines: string[]
  notes: string[]
  table: ReportTable | null
}

const sgn = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}%`
const monthName = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`

// 표 칸: 단위 없이 값만(단위는 머리글에), 없으면 "-"
const cellNum = (v: number | null | undefined) => (v == null ? '-' : Math.round(v).toLocaleString('ko-KR'))
const cellPct = (v: number | null | undefined) => (v == null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`)
const cellRatio = (v: number | null | undefined) => (v == null ? '-' : v.toFixed(2))

export function sourceLine(meta: Meta | null): string {
  const a = meta?.asof
  const when = a?.arrivals_latest ? `입국 ${fmtYm(a.arrivals_latest)}까지, 데이터랩 ${a.datalab_extract ?? fmtYm(a.datalab_latest)} 추출` : '기준일 확인 필요'
  return `※ 자료: 한국관광 데이터랩 외래객 지역별 방한현황, 관광지식정보시스템 입국관광통계(${when})`
}

const CARD_NOTE = '※ 카드소비는 외국 발행 신용카드 결제분으로 현금·여행사 선결제가 빠진 하한값'

/** 문서 머리 줄: 기준 시점 · 작성일 */
export function metaLine(meta: Meta | null, today: Date = new Date()): string {
  const a = meta?.asof
  const when = a?.arrivals_latest ? `입국 ${fmtYm(a.arrivals_latest)}까지 · 데이터랩 ${a.datalab_extract ?? fmtYm(a.datalab_latest)} 추출` : '기준일 확인 필요'
  const d = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
  return `${when} · 작성 ${d} · 공항 체류전환 모니터`
}

/** 복사·.txt용 개조식 텍스트 */
export function renderText(doc: ReportDoc): string {
  return [`□ ${doc.title}`, '', ...doc.lines, '', ...doc.notes].join('\n')
}

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

/** 현황 한 줄(현황 탭·보고서 첫 문장) */
export function summaryLine(data: Indicators, nat: string): string | null {
  const t = target(data)
  const hv = halves(data, t, nat)
  if (!hv || !hv[0].per_arrival_spend || !hv[1].per_arrival_spend) return null
  const [h1, h0] = hv
  return `${fmtHalf(data.halves.target)} ${t.name}공항 ${nat} 입국 ${fmt(h1.arrivals)}명(${arrivalsChange(h1, h0)}), 입국 1인당 ${t.region} 카드소비 ${fmt(h1.per_arrival_spend)}원(${perChange(h1, h0, ',')}), 체류 ${fmtRatio(h1.visit_ratio)}인·일(전년 ${fmtRatio(h0.visit_ratio)}).`
}

// ── 월간 동향 ─────────────────────────────────────────────

export function monthlyDoc(data: Indicators, meta: Meta | null, today?: Date): ReportDoc {
  const t = target(data)
  const nats = data.nationalities.filter((n) => t.nat[n]?.monthly)
  const ms = nats.map((n) => [n, latestMonth(data, t, n)!] as const)
  const ym = ms[0]?.[1].ym ?? data.months[data.months.length - 1]
  const yoyPct = (a: number | null, b: number | null) => {
    const g = a != null && b ? growthPct(a, b) : null
    return g == null ? '' : `(전년 동월 대비 ${sgn(g)})`
  }
  const lines: string[] = [
    ` ○ 입국: ${ms.map(([n, m]) => `${n} ${fmt(m.arr)}명${yoyPct(m.arr, m.arrYoy)}`).join(', ')}`,
    ` ○ 체류: 입국 1인당 ${t.region} 체류 인·일 ${ms.map(([n, m]) => `${n} ${fmtRatio(m.ratio)}(전년 동월 ${fmtRatio(m.ratioYoy)})`).join(', ')}`,
    ` ○ 소비: 입국 1인당 ${t.region} 카드소비 ${ms.map(([n, m]) => `${n} ${fmt(m.per)}원(전년 동월 ${fmt(m.perYoy)}원)`).join(', ')}`,
    '   - 월별 값은 입국자 수에 따라 크게 흔들리므로 방향 확인용이며, 판단은 반기 값으로 함',
    '',
    `□ ${fmtHalf(data.halves.target)} 누계(판단 기준)`,
  ]
  const rows: string[][] = []
  const mLabel = `${Number(ym.slice(4))}월`
  const hLabel = data.halves.target.endsWith('1') ? '상반기' : '하반기'
  for (const [n, m] of ms) {
    const hv = halves(data, t, n)
    if (!hv) continue
    const [h1, h0] = hv
    const g = growthPct(h1.arrivals, h0.arrivals)
    lines.push(
      ` ○ ${n}: 입국 ${fmt(h1.arrivals)}명(전년 동기 대비 ${g == null ? '–' : sgn(g)}), 1인당 카드소비 ${fmt(h1.per_arrival_spend)}원(전년 동기 ${fmt(h0.per_arrival_spend)}원), 체류 ${fmtRatio(h1.visit_ratio)}인·일(${fmtRatio(h0.visit_ratio)})`,
    )
    rows.push([
      n,
      cellNum(m.arr),
      cellPct(m.arr != null && m.arrYoy ? growthPct(m.arr, m.arrYoy) : null),
      cellNum(m.per),
      cellNum(h1.arrivals),
      cellNum(h1.per_arrival_spend),
      cellRatio(h1.visit_ratio),
    ])
  }
  return {
    title: `${t.name}공항 외래객 ${t.region} 체류·소비 동향(${monthName(ym)})`,
    meta: metaLine(meta, today),
    lines,
    notes: [sourceLine(meta), CARD_NOTE],
    table: {
      caption: `국적별 입국·체류·소비(${t.name}공항 → ${t.region})`,
      header: ['국적', `${mLabel} 입국(명)`, `${mLabel} 전년 같은 달 대비(%)`, `${mLabel} 1인당 카드소비(원)`, `${hLabel} 입국(명)`, `${hLabel} 1인당 카드소비(원)`, `${hLabel} 체류(인·일)`],
      rows,
    },
  }
}

// ── 반기 분석 ─────────────────────────────────────────────

export function halfDoc(data: Indicators, sgg: SggData, meta: Meta | null, nat: string, effect: ScenarioResult | null, today?: Date): ReportDoc {
  const t = target(data)
  const hv = halves(data, t, nat)
  const lines: string[] = []
  if (hv && hv[0].per_arrival_spend && hv[1].per_arrival_spend) {
    const [h1, h0] = hv
    lines.push(` ○ (현황) 입국 ${fmt(h1.arrivals)}명으로 ${arrivalsChange(h1, h0)}, 입국 1인당 ${t.region} 카드소비는 ${fmt(h1.per_arrival_spend)}원으로 ${perChange(h1, h0)}`)
    const others = data.airports
      .filter((a) => a.id !== t.id && a.nat[nat]?.status === '채택')
      .map((a) => ({ a, per: a.nat[nat]!.halves![data.halves.target].per_arrival_spend ?? 0 }))
      .sort((x, y) => y.per - x.per)
    if (others.length) {
      lines.push(
        ` ○ (비교) 같은 산식으로 ${others.map(({ a, per }) => `${a.name}공항 입국자의 ${a.region} 소비 ${fmt(per)}원(${times(per / h1.per_arrival_spend!)})`).join(', ')}`,
      )
    }
  }
  const st = mapStory(sgg, nat)
  if (st && st.visitTop.cd !== st.spendTop.cd) {
    const v = st.visitTop.nat[nat]
    const ap = st.visitTop.cd === sgg.airport_cd ? '공항 소재, ' : ''
    lines.push(
      ` ○ (권역 내) 방문은 ${st.visitTop.name}(${ap}월평균 ${fmt(v.visit_mavg)}명)에 몰리나 방문 1회당 소비는 ${fmt(v.per_visit)}원이고, ${st.spendTop.name}는 ${fmt(st.spendTop.nat[nat].per_visit)}원으로 ${st.ratio ? times(st.ratio) : ''}`,
    )
  }
  const d = data.decomposition
  if (!d.skipped) {
    const lead = decompRows(d).find((r) => r.lead)!
    const what = lead.key === 'comp' ? '국적 구성 변화' : `${lead.key} 입국자의 1인당 소비 ${lead.value < 0 ? '감소' : '증가'}`
    lines.push(
      ` ○ (변화 요인) ${d.nats.join('·')} 합산 1인당 카드소비 ${fmt(d.R0)}원 → ${fmt(d.R1)}원(${d.total < 0 ? '−' : '+'}${fmt(Math.abs(d.total))}원) 중 ${what}가 ${lead.value < 0 ? '−' : '+'}${fmt(Math.abs(lead.value))}원`,
    )
  }
  if (effect) {
    lines.push(` ○ (체류 효과) 체류가 ${effect.days.toFixed(1)}일 늘면 추가 카드소비 ${fmtEok(effect.low)}~${fmtEok(effect.high)} 원(반기 입국 기준, 하한값)`)
  }
  const rows = data.airports.map((a) => {
    const h = halves(data, a, nat)
    if (!h) return [`${a.name}공항`, a.region, a.nat[nat]?.status ?? '자료 없음', '-', '-', '-', '-']
    const [h1, h0] = h
    return [`${a.name}공항`, a.region, a.nat[nat]!.status, cellNum(h1.arrivals), cellPct(growthPct(h1.arrivals, h0.arrivals)), cellNum(h1.per_arrival_spend), cellRatio(h1.visit_ratio)]
  })
  return {
    title: `${t.name}공항 입국 ${nat}인의 ${t.region} 체류·소비 분석(${fmtHalf(data.halves.target)})`,
    meta: metaLine(meta, today),
    lines,
    notes: [sourceLine(meta), CARD_NOTE, '※ 연동 검정 「참고값」은 인천 입국자 혼입을 걸러내지 못한 값으로 비교에서 제외'],
    table: {
      caption: `공항별 비교(${fmtHalf(data.halves.target)} · ${nat} · 같은 산식)`,
      header: ['공항', '권역', '연동 검정', '입국(명)', '입국 증감(%)', '1인당 카드소비(원)', '체류(인·일)'],
      rows,
    },
  }
}

// ── 사업 효과 근거 ───────────────────────────────────────

export function effectDoc(
  data: Indicators,
  meta: Meta | null,
  nat: string,
  r: ScenarioResult,
  compareId: string,
  arrivalsFromInput: boolean,
  budgetEok: number | null,
  today?: Date,
): ReportDoc {
  const t = target(data)
  const c = data.airports.find((a) => a.id === compareId)
  const budget = budgetEok && budgetEok > 0 ? budgetEok * 1e8 : null
  const lines: string[] = [
    ' ○ 산식: 대상 입국자 × 체류 증가일 × 입국자 인·일당 카드소비',
    ` ○ ${t.name}공항 ${nat} 입국 ${fmt(r.arrivals)}명${arrivalsFromInput ? '(입력값)' : `(${fmtHalf(data.halves.target)} 실적)`} × ${r.days.toFixed(1)}일 × ${fmt(r.perDayTarget)}~${fmt(r.perDayCompare)}원 = ${fmtEok(r.low)}~${fmtEok(r.high)} 원`,
    `   - 하한: ${t.name}공항 입국자의 현재 ${t.region} 인·일당 카드소비 ${fmt(r.perDayTarget)}원(${fmtHalf(data.halves.target)})`,
  ]
  if (c) lines.push(`   - 상한: ${c.name}공항 입국자의 ${c.region} 인·일당 카드소비 ${fmt(r.perDayCompare)}원(같은 기간${r.compareIsReference ? ', 참고값' : ''})`)
  if (budget) lines.push(` ○ 사업비 ${budgetEok!.toLocaleString('ko-KR')}억 원 대비 추가 소비 ${(r.low / budget).toFixed(1)}~${(r.high / budget).toFixed(1)}배`)
  const row = (label: string, basis: string, perDay: number) => {
    const amt = r.arrivals * r.days * perDay
    const mil = (amt / 1e6).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return [label, basis, cellNum(r.arrivals), r.days.toFixed(1), cellNum(perDay), mil, budget ? (amt / budget).toFixed(1) : '-']
  }
  return {
    title: '체류 연장 시 추가 카드소비 효과(추정)',
    meta: metaLine(meta, today),
    lines,
    notes: ['※ 인·일당 카드소비 = 입국 1인당 권역 카드소비 ÷ 입국 1인당 권역 체류 인·일(한국관광 데이터랩)', CARD_NOTE],
    table: {
      caption: `추가 카드소비 산출(${t.name}공항 ${nat} 입국자)`,
      header: ['구분', '기준', '입국자(명)', '체류 증가일(일)', '인·일당 카드소비(원)', '추가 소비(백만원)', '사업비 대비(배)'],
      rows: [row('하한', `${t.name} 현재`, r.perDayTarget), ...(c ? [row('상한', `${c.name} 수준${r.compareIsReference ? '(참고)' : ''}`, r.perDayCompare)] : [])],
    },
  }
}

// ── 복사용 텍스트(기존 호출부 호환) ─────────────────────────

export const monthlyReport = (data: Indicators, meta: Meta | null) => renderText(monthlyDoc(data, meta))

export const halfReport = (data: Indicators, sgg: SggData, meta: Meta | null, nat: string, effect: ScenarioResult | null) =>
  renderText(halfDoc(data, sgg, meta, nat, effect))

export const effectReport = (data: Indicators, nat: string, r: ScenarioResult, compareId: string, arrivalsFromInput: boolean, budgetEok: number | null) =>
  renderText(effectDoc(data, null, nat, r, compareId, arrivalsFromInput, budgetEok))
