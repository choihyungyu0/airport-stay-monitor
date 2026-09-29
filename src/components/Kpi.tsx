import { fmt, fmtEok, fmtHalf, fmtRatio, fmtYm, growthPct, signedPct } from '../lib/format'
import { latestMonth } from '../lib/report'
import type { Indicators } from '../lib/types'

interface Tile {
  key: string
  label: string
  value: string
  unit: string
  prev: string
  delta: string
  month: string
  main?: boolean
}

const pctOf = (a: number | null | undefined, b: number | null | undefined) => {
  const g = a != null && b ? growthPct(a, b) : null
  return g == null ? '' : signedPct(g, Math.abs(g) < 10 ? 1 : 0)
}
const diff = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? '' : `${a - b >= 0 ? '+' : '−'}${Math.abs(a - b).toFixed(2)}`

/** 반기 핵심 지표 4개. 큰 숫자는 판단 기준인 반기 값, 아래 줄은 최근 달(방향 확인용). */
export function KpiTiles({ data, nat }: { data: Indicators; nat: string }) {
  const t = data.airports.find((a) => a.id === data.target)!
  const { base, target } = data.halves
  const h1 = t.nat[nat]?.halves?.[target]
  const h0 = t.nat[nat]?.halves?.[base]
  const m = latestMonth(data, t, nat)
  if (!h1 || !h0) return <p className="cap">{t.name}공항 {nat} 자료가 없습니다.</p>
  const mm = m ? fmtYm(m.ym) : ''
  const tiles: Tile[] = [
    {
      key: 'arr',
      label: `${nat} 입국자`,
      value: fmt(h1.arrivals),
      unit: '명',
      prev: `전년 동기 ${fmt(h0.arrivals)}명`,
      delta: pctOf(h1.arrivals, h0.arrivals),
      month: m ? `${mm} ${fmt(m.arr)}명 · 전년 같은 달 대비 ${pctOf(m.arr, m.arrYoy) || '–'}` : '',
    },
    {
      key: 'card',
      label: `${t.region} ${nat}인 카드소비`,
      value: fmtEok(h1.card).replace('억', ''),
      unit: '억 원',
      prev: `전년 동기 ${fmtEok(h0.card)} 원`,
      delta: pctOf(h1.card, h0.card),
      month: m?.card != null ? `${mm} ${fmtEok(m.card)} 원 · 전년 같은 달 대비 ${pctOf(m.card, m.cardYoy) || '–'}` : '',
    },
    {
      key: 'per',
      label: '① 입국 1인당 카드소비',
      value: fmt(h1.per_arrival_spend),
      unit: '원',
      prev: `전년 동기 ${fmt(h0.per_arrival_spend)}원`,
      delta: pctOf(h1.per_arrival_spend, h0.per_arrival_spend),
      month: m ? `${mm} ${fmt(m.per)}원 · 전년 같은 달 ${fmt(m.perYoy)}원` : '',
      main: true,
    },
    {
      key: 'ratio',
      label: '② 입국 1인당 체류 인·일',
      value: fmtRatio(h1.visit_ratio),
      unit: '인·일',
      prev: `전년 동기 ${fmtRatio(h0.visit_ratio)}`,
      delta: diff(h1.visit_ratio, h0.visit_ratio),
      month: m ? `${mm} ${fmtRatio(m.ratio)} · 전년 같은 달 ${fmtRatio(m.ratioYoy)}` : '',
    },
  ]
  return (
    <div className="kpis" role="list" aria-label={`${fmtHalf(target)} 핵심 지표`}>
      {tiles.map((k) => (
        <div key={k.key} className={`kpi${k.main ? ' main' : ''}`} role="listitem">
          <span className="kpi-k">{k.label}</span>
          <span className="kpi-v">
            {k.value}
            <small>{k.unit}</small>
          </span>
          <span className="kpi-d">
            {k.prev}
            {k.delta && <b>{k.delta}</b>}
          </span>
          {k.month && <span className="kpi-m">{k.month}</span>}
        </div>
      ))}
    </div>
  )
}
