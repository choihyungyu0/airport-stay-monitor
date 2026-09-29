import { fmt, fmtHalf, fmtRatio, growthPct, signedPct } from '../lib/format'
import type { Airport, Indicators, Judgement } from '../lib/types'

const CHIP: Record<Judgement, { cls: string; text: string }> = {
  채택: { cls: 'ok', text: '연동 검정 통과' },
  참고값: { cls: 'no', text: '참고값' },
  보류: { cls: 'skip', text: '판정 보류' },
  '자료 없음': { cls: 'skip', text: '자료 없음' },
}

/** CHP-01 연동 검정 칩. 통과는 초록·체크, 미통과는 회색 점선 테두리(색 외 형태로도 구분). */
export function StatusChip({ status }: { status: Judgement }) {
  const c = CHIP[status]
  return (
    <span className={`chip ${c.cls}`} data-ui="CHP-01">
      {status === '채택' && <span aria-hidden="true">✓</span>}
      {c.text}
    </span>
  )
}

function Card({ airport, data, nat }: { airport: Airport; data: Indicators; nat: string }) {
  const b = airport.nat[nat]
  const { base, target } = data.halves
  const h1 = b?.halves?.[target]
  const h0 = b?.halves?.[base]
  const hl = airport.id === data.target
  const head = (
    <div className="top">
      <div>
        <div className="ap">{airport.name}공항</div>
        <div className="route">→ {airport.region} 권역</div>
      </div>
      <StatusChip status={b?.status ?? '자료 없음'} />
    </div>
  )
  if (!h1 || !h0 || !b?.v2) {
    return (
      <article className={`card empty${hl ? ' hl' : ''}`} aria-label={`${airport.name}공항 자료 없음`}>
        {head}
        <p className="note">
          {airport.region} 권역의 {nat} 방문·카드 자료가 없어 지표를 산출하지 않았습니다.
        </p>
      </article>
    )
  }
  const g = growthPct(h1.arrivals, h0.arrivals)
  return (
    <article className={`card${hl ? ' hl' : ''}`} aria-label={`${airport.name}공항 ${nat}`}>
      {head}
      <div>
        <div className="route">① 입국 1인당 권역 카드소비</div>
        <div className="big">
          {fmt(h1.per_arrival_spend)}
          <small>원</small>
        </div>
      </div>
      <dl className="kv">
        <div>
          <dt>② 방문 배율(인·일)</dt>
          <dd>
            {fmtRatio(h1.visit_ratio)} <small>전년 {fmtRatio(h0.visit_ratio)}</small>
          </dd>
        </div>
        <div>
          <dt>① 전년 동기</dt>
          <dd>
            {fmt(h0.per_arrival_spend)}
            <small>원</small>
          </dd>
        </div>
        <div>
          <dt>{nat} 입국(반기)</dt>
          <dd>
            {fmt(h1.arrivals)} <small>{g == null ? '' : signedPct(g)}</small>
          </dd>
        </div>
        <div>
          <dt>차분 상관(인천)</dt>
          <dd>
            {fmtRatio(b.v2.dv)} <small>({fmtRatio(b.v2.di)})</small>
          </dd>
        </div>
      </dl>
      <span className="sr-only">
        {fmtHalf(target)} 기준, 전년 동기 {fmtHalf(base)}와 비교
      </span>
    </article>
  )
}

/** UI-01 공항별 요약 카드(CRD-01). */
export function AirportCards({ data, nat }: { data: Indicators; nat: string }) {
  return (
    <div className="cards" data-ui="CRD-01">
      {data.airports.map((a) => (
        <Card key={a.id} airport={a} data={data} nat={nat} />
      ))}
    </div>
  )
}

export function CardsSkeleton() {
  return (
    <div className="cards" aria-busy="true" aria-label="불러오는 중">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  )
}
