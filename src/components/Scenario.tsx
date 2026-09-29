import { useId, useState } from 'react'
import { fmt, fmtEok, fmtHalf } from '../lib/format'
import { clampDays, compareCandidates, computeScenario } from '../lib/scenario'
import { daysPhrase } from '../lib/story'
import type { Indicators } from '../lib/types'
import { Segmented } from './Segmented'

/** UI-08 체류 증가 계산기(SLD-01 → CRD-02). 공항 방향 표지판처럼 "다음 행동"을 가리킨다. */
export function Scenario({ data, nat }: { data: Indicators; nat: string }) {
  const cfg = data.scenario
  const [days, setDays] = useState(cfg.default_days)
  const [compare, setCompare] = useState(cfg.default_compare)
  const id = useId()
  const target = data.airports.find((a) => a.id === data.target)
  const cands = compareCandidates(data)
  const cmp = cands.find((a) => a.id === compare)
  const r = computeScenario(data, nat, days, compare)
  const ticks: number[] = []
  for (let t = cfg.min_days; t <= cfg.max_days + 1e-9; t += cfg.step) ticks.push(Math.round(t * 10) / 10)

  return (
    <section className="sign" id="scenario" aria-labelledby="h-scen">
      <div className="sign-head">
        <p className="q">그래서 얼마인가</p>
        <h2 id="h-scen">
          {target?.name}공항 {nat} 입국자가 {target?.region}에 {daysPhrase(days)}
        </h2>
      </div>
      <div className="amount" data-ui="CRD-02" aria-live="polite">
        {r ? (
          <>
            +{fmtEok(r.low)} ~ {fmtEok(r.high)}
            <small>원 더</small>
          </>
        ) : (
          '–'
        )}
      </div>
      <div className="sign-how">
        {r ? (
          <>
            <p className="how">
              {fmtHalf(data.halves.target)} 입국 {fmt(r.arrivals)}명 × {r.days.toFixed(1)}일 × 인·일당 {fmt(r.perDayTarget)}원(지금 {target?.name}) ~{' '}
              {fmt(r.perDayCompare)}원({cmp?.name} 수준{r.compareIsReference ? ', 참고값' : ''})
            </p>
            <p className="how dim">카드 결제만 센 하한값입니다. 현금·여행사 선결제는 빠집니다.</p>
          </>
        ) : (
          <p className="how">선택한 공항의 {nat} 자료가 없어 계산하지 않습니다.</p>
        )}
      </div>
      <div className="sign-ctrl">
        <div>
          <label htmlFor={`${id}-d`}>
            더 머무는 날
            <output htmlFor={`${id}-d`}>+{days.toFixed(1)}일</output>
          </label>
          <input
            id={`${id}-d`}
            type="range"
            min={cfg.min_days}
            max={cfg.max_days}
            step={cfg.step}
            value={days}
            onChange={(e) => setDays(clampDays(Number(e.target.value), cfg.min_days, cfg.max_days))}
            data-ui="SLD-01"
            aria-valuetext={`${days.toFixed(1)}일`}
          />
          <div className="ticks" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t}>{t.toFixed(1)}</span>
            ))}
          </div>
        </div>
        <div>
          <span className="lbl" aria-hidden="true">상한으로 삼을 공항</span>
          <Segmented
            ui="SEG-04"
            small
            label="상한으로 삼을 공항"
            value={compare}
            onChange={setCompare}
            options={cands.map((a) => ({ value: a.id, label: a.nat[nat]?.status === '채택' ? a.name : `${a.name}(참고)` }))}
          />
        </div>
      </div>
    </section>
  )
}
