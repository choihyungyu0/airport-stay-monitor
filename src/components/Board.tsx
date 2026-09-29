import { fmt, fmtHalf, fmtRatio, growthPct, signedPct } from '../lib/format'
import { iata } from '../lib/story'
import type { Airport, Indicators, Judgement, NatBlock } from '../lib/types'
import { Flap } from './Flap'

const STATUS: Record<Judgement, { cls: string; text: string }> = {
  채택: { cls: 'ok', text: '연동 검정 통과' },
  참고값: { cls: 'no', text: '참고값' },
  보류: { cls: 'skip', text: '판정 보류' },
  '자료 없음': { cls: 'skip', text: '자료 없음' },
}

/** CHP-01. 통과는 채운 점, 참고값은 빈 점(색 외 형태로도 구분). 상관계수는 풀어서 읽어 준다. */
function Status({ b }: { b?: NatBlock }) {
  const s = STATUS[b?.status ?? '자료 없음']
  const v = b?.v2
  const detail = v?.dv != null ? `차분 상관 ${fmtRatio(v.dv)}(인천 ${fmtRatio(v.di)}), 수준 상관 ${fmtRatio(v.lv)}(인천 ${fmtRatio(v.li)})` : ''
  return (
    <span className={`st ${s.cls}`} data-ui="CHP-01" title={detail || undefined}>
      <i aria-hidden="true" />
      {s.text}
      {detail && <span className="sr-only">, {detail}</span>}
    </span>
  )
}

function Row({ a, data, nat, max }: { a: Airport; data: Indicators; nat: string; max: number }) {
  const b = a.nat[nat]
  const { base, target } = data.halves
  const h1 = b?.halves?.[target]
  const h0 = b?.halves?.[base]
  const isTarget = a.id === data.target
  const cls = ['brow', isTarget ? 'target' : '', b?.status === '참고값' ? 'ref' : '', !h1 ? 'empty' : ''].filter(Boolean).join(' ')
  const head = (
    <>
      <span className="b-code" role="cell">{iata(a)}</span>
      <span className="b-name" role="rowheader">
        <strong>{a.name}</strong>
        <small>→ {a.region}</small>
      </span>
    </>
  )
  if (!h1 || !h0) {
    return (
      <div className={cls} role="row" aria-label={`${a.name}공항 자료 없음`}>
        {head}
        <span className="b-spend" role="cell">{a.region} 권역의 {nat} 방문·카드 자료가 없습니다</span>
        <span role="cell" />
        <span role="cell" />
        <span className="b-st" role="cell"><Status b={b} /></span>
      </div>
    )
  }
  const g = growthPct(h1.arrivals, h0.arrivals)
  const per = h1.per_arrival_spend ?? 0
  return (
    <div className={cls} role="row" aria-label={`${a.name}공항 ${nat}`}>
      {head}
      <span className="b-spend" role="cell">
        <span className="top">
          <Flap key={`${nat}-${per}`} text={fmt(per)} />
          <span className="won">원</span>
          <span className="b-prev">전년 {fmt(h0.per_arrival_spend)}</span>
        </span>
        <span className="b-bar" aria-hidden="true">
          <i style={{ width: `${Math.max(1.5, (per / max) * 100)}%` }} />
        </span>
      </span>
      <span className="b-num b-ratio" role="cell">
        <strong><span className="ilabel">체류 인·일</span>{fmtRatio(h1.visit_ratio)}</strong>
        <small>전년 {fmtRatio(h0.visit_ratio)}</small>
      </span>
      <span className="b-num b-arr" role="cell">
        <strong><span className="ilabel">입국</span>{fmt(h1.arrivals)}</strong>
        <small>{g == null ? '' : signedPct(g)}</small>
      </span>
      <span className="b-st" role="cell"><Status b={b} /></span>
    </div>
  )
}

/** UI-01 공항별 요약. 공항 출발 안내판 형식으로 네 공항을 한 줄씩 비교한다(CRD-01). */
export function Board({ data, nat }: { data: Indicators; nat: string }) {
  const { target } = data.halves
  const max = Math.max(1, ...data.airports.map((a) => a.nat[nat]?.halves?.[target]?.per_arrival_spend ?? 0))
  return (
    <div className="board" data-ui="CRD-01">
      <div className="board-title">
        <b>공항별 권역 체류·소비</b>
        <span>{fmtHalf(target)} · {nat} 입국자</span>
      </div>
      <div role="table" aria-label={`공항별 권역 체류·소비, ${fmtHalf(target)} ${nat}`}>
        <div className="brow bhead" role="row">
          <span role="columnheader">공항</span>
          <span role="columnheader">→ 권역</span>
          <span role="columnheader" style={{ textAlign: 'left' }}>① 입국 1인당 권역 카드소비</span>
          <span role="columnheader">② 체류 인·일</span>
          <span role="columnheader">입국(반기)</span>
          <span role="columnheader">연동 검정</span>
        </div>
        {data.airports.map((a) => (
          <Row key={a.id} a={a} data={data} nat={nat} max={max} />
        ))}
      </div>
    </div>
  )
}

export function BoardSkeleton() {
  return <div className="skel" style={{ height: 330 }} aria-busy="true" aria-label="불러오는 중" />
}
