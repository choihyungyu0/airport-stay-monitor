import { useId } from 'react'
import { CopyBox } from '../components/CopyBox'
import { Segmented } from '../components/Segmented'
import { PageHead } from '../components/Shell'
import { fmt, fmtEok, fmtHalf } from '../lib/format'
import { effectReport } from '../lib/report'
import { clampDays, compareCandidates, computeScenario, type ScenarioInput } from '../lib/scenario'
import { daysPhrase } from '../lib/story'
import type { Indicators, Meta } from '../lib/types'

interface Props {
  data: Indicators
  meta: Meta | null
  nat: string
  input: ScenarioInput
  onInput: (next: ScenarioInput) => void
  onToast: (m: string) => void
}

/** 효과 계산(UI-08): 사업 계획·예산 요구서에 쓰는 추가 소비 추정과 산출 근거. */
export function EffectView({ data, meta, nat, input, onInput, onToast }: Props) {
  const id = useId()
  const cfg = data.scenario
  const t = data.airports.find((a) => a.id === data.target)!
  const actual = t.nat[nat]?.halves?.[data.halves.target]?.arrivals ?? 0
  const cands = compareCandidates(data)
  const r = computeScenario(data, nat, input.days, input.compare, input.arrivals)
  const set = (patch: Partial<ScenarioInput>) => onInput({ ...input, ...patch })
  const ticks: number[] = []
  for (let v = cfg.min_days; v <= cfg.max_days + 1e-9; v += cfg.step) ticks.push(Math.round(v * 10) / 10)
  const budget = input.budget && input.budget > 0 ? input.budget * 1e8 : null

  return (
    <>
      <PageHead title="효과 계산" sub={`${t.name}공항 ${nat} 입국자가 ${t.region}에 더 머물 때`} meta={meta} />
      <div className="effect">
        <form className="panel inputs" onSubmit={(e) => e.preventDefault()} aria-label="계산 조건">
          <div className="field">
            <label htmlFor={`${id}-n`}>대상 입국자</label>
            <div className="numin">
              <input
                id={`${id}-n`}
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={input.arrivals ?? actual}
                onChange={(e) => set({ arrivals: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              />
              <span>명</span>
            </div>
            <p className="hint">
              {fmtHalf(data.halves.target)} 실적 {fmt(actual)}명
              {input.arrivals != null && input.arrivals !== actual && (
                <button type="button" className="linkbtn" onClick={() => set({ arrivals: null })}>
                  실적으로 되돌리기
                </button>
              )}
            </p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-d`}>
              더 머무는 날 <output htmlFor={`${id}-d`}>+{input.days.toFixed(1)}일</output>
            </label>
            <input
              id={`${id}-d`}
              type="range"
              min={cfg.min_days}
              max={cfg.max_days}
              step={cfg.step}
              value={input.days}
              onChange={(e) => set({ days: clampDays(Number(e.target.value), cfg.min_days, cfg.max_days) })}
              data-ui="SLD-01"
              aria-valuetext={`${input.days.toFixed(1)}일`}
            />
            <div className="ticks" aria-hidden="true">
              {ticks.map((v) => (
                <span key={v}>{v.toFixed(1)}</span>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="lbl" id={`${id}-c`}>상한으로 삼을 공항</span>
            <Segmented
              ui="SEG-04"
              small
              label="상한으로 삼을 공항"
              value={input.compare}
              onChange={(v) => set({ compare: v })}
              options={cands.map((a) => ({ value: a.id, label: a.nat[nat]?.status === '채택' ? a.name : `${a.name}(참고)` }))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-b`}>사업비(선택)</label>
            <div className="numin">
              <input
                id={`${id}-b`}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                placeholder="예: 1.5"
                value={input.budget ?? ''}
                onChange={(e) => set({ budget: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              />
              <span>억 원</span>
            </div>
            <p className="hint">넣으면 사업비 대비 추가 소비 배수를 함께 계산합니다.</p>
          </div>
        </form>

        <section className="sign" aria-labelledby="h-eff" data-ui="CRD-02">
          <p className="q">추가 카드소비(추정)</p>
          <h2 id="h-eff">
            {fmt(r?.arrivals ?? actual)}명이 {daysPhrase(input.days)}
          </h2>
          <div className="amount" aria-live="polite">
            {r ? (
              <>
                +{fmtEok(r.low)} ~ {fmtEok(r.high)}
                <small>원</small>
              </>
            ) : (
              '–'
            )}
          </div>
          {r && (
            <dl className="sign-dl">
              <div>
                <dt>하한 · 지금 {t.name} 인·일당</dt>
                <dd>{fmt(r.perDayTarget)}원</dd>
              </div>
              <div>
                <dt>
                  상한 · {cands.find((a) => a.id === input.compare)?.name} 수준{r.compareIsReference ? '(참고값)' : ''}
                </dt>
                <dd>{fmt(r.perDayCompare)}원</dd>
              </div>
              {budget && (
                <div>
                  <dt>사업비 대비</dt>
                  <dd>
                    {(r.low / budget).toFixed(1)}~{(r.high / budget).toFixed(1)}배
                  </dd>
                </div>
              )}
            </dl>
          )}
          <p className="how">카드 결제만 센 하한값입니다. 현금·여행사 선결제는 빠집니다.</p>
        </section>
      </div>

      {r && (
        <section className="block" aria-label="산출 근거">
          <CopyBox
            label="산출 근거 · 예산 요구서·사업계획서에 붙여 넣기"
            text={effectReport(data, nat, r, input.compare, input.arrivals != null && input.arrivals !== actual, input.budget)}
            filename={`체류효과_산출근거_${nat}.txt`}
            onToast={onToast}
          />
        </section>
      )}
    </>
  )
}
