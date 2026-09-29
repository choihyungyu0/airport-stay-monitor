import { useId, useState } from 'react'
import { fmt, fmtEok, fmtHalf } from '../lib/format'
import { clampDays, compareCandidates, computeScenario } from '../lib/scenario'
import type { Indicators } from '../lib/types'

/** UI-08 체류 증가 계산기(SLD-01 → CRD-02). */
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
    <div className="panel scen">
      <div>
        <h3>체류가 늘면 얼마가 더 쓰이나</h3>
        <p className="note">
          {target?.name}공항 {nat} 입국자가 {target?.region} 권역에 머무는 날이 늘 때의 추가 카드소비입니다. 하한은 {target?.name}의 현재
          인·일당 소비, 상한은 비교 공항의 실측값입니다.
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-d`}>
          체류 증가일
          <output className="days" htmlFor={`${id}-d`}>
            +{days.toFixed(1)}일
          </output>
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
        <label htmlFor={`${id}-c`}>비교 공항(상한)</label>
        <select id={`${id}-c`} value={compare} onChange={(e) => setCompare(e.target.value)}>
          {cands.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}공항 → {a.region}
              {a.nat[nat]?.status === '채택' ? '' : ` (${a.nat[nat]?.status ?? '자료 없음'})`}
            </option>
          ))}
        </select>
      </div>
      <div className="result" data-ui="CRD-02" aria-live="polite">
        {r ? (
          <>
            <div className="route">추가 카드소비 · {fmtHalf(data.halves.target)} 입국 기준</div>
            <div className="big">
              +{fmtEok(r.low)} ~ +{fmtEok(r.high)}
              <small>원</small>
            </div>
            <div className="how">
              {nat} 입국 {fmt(r.arrivals)}명 × {r.days.toFixed(1)}일 × 인·일당 {fmt(r.perDayTarget)}원({target?.name}) ~ {fmt(r.perDayCompare)}원(
              {cmp?.name}
              {r.compareIsReference ? ', 참고값' : ''})
            </div>
            <div className="how">카드 결제 기준 하한값입니다. 현금·여행사 선결제는 빠집니다. 인·일당 = ① ÷ ②.</div>
          </>
        ) : (
          <div className="how">선택한 공항의 {nat} 자료가 없어 계산하지 않습니다.</div>
        )}
      </div>
    </div>
  )
}
