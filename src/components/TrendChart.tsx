import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fmt, fmtYm } from '../lib/format'
import { axisTop, buildSeries, dividerIndex, tickLabel, type Series } from '../lib/series'
import { airportVar } from '../lib/theme'
import type { Indicators, Metric } from '../lib/types'

interface Props {
  data: Indicators
  nat: string
  metric: Metric
}

const UNIT: Record<Metric, string> = { ratio: '', card: '원', arr: '명' }

function valueText(v: number, metric: Metric): string {
  return metric === 'ratio' ? v.toFixed(2) : `${fmt(v)}${UNIT[metric]}`
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(900)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth || 900)
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** LGD-01 공항 색 범례. 참고값은 점선 견본과 "(참고)" 표기. */
export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <div className="legend" data-ui="LGD-01">
      {series.map((s, i) => {
        const color = `var(${airportVar(s.airport.color, i)})`
        const ref = s.available && !s.passed
        return (
          <span key={s.airport.id}>
            <i className={ref ? 'dash' : ''} style={ref ? { borderColor: color } : { background: color }} />
            {s.airport.name}
            {!s.available ? ' (자료 없음)' : ref ? ' (참고)' : ''}
          </span>
        )
      })}
    </div>
  )
}

/** UI-03 월별 추이(CHT-01). */
export function TrendChart({ data, nat, metric }: Props) {
  const [box, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const series = useMemo(() => buildSeries(data, nat, metric), [data, nat, metric])
  const { months, min_monthly_arrivals: minArr } = data
  const narrow = w < 560
  const H = narrow ? 250 : 320
  const L = narrow ? 44 : 60
  const R = 14
  const T = 22
  const B = 34
  const n = months.length
  const { top, step } = axisTop(series, metric)
  const x = (i: number) => L + ((w - L - R) * i) / Math.max(1, n - 1)
  const y = (v: number) => T + (H - T - B) * (1 - Math.min(v, top) / top)
  const div = dividerIndex(months, data.definition_change)
  const targetId = data.target

  const ticks: number[] = []
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(t)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * w
    const i = Math.round(((px - L) / (w - L - R)) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = hover ?? n - 1
    const next =
      e.key === 'ArrowLeft' ? Math.max(0, cur - 1)
      : e.key === 'ArrowRight' ? Math.min(n - 1, cur + 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : e.key === 'Escape' ? null
      : undefined
    if (next === undefined) return
    e.preventDefault()
    setHover(next)
  }

  const tipRows = hover == null ? [] : series.map((s, si) => {
    const v = s.values[hover]
    const a = s.arrivals[hover]
    const why = !s.available ? '자료 없음' : v == null && a != null && a < minArr ? `입국 ${minArr}명 미만` : v == null ? '자료 없음' : null
    return { s, si, v, why }
  })
  const liveText = hover == null ? '' : `${fmtYm(months[hover])} ` +
    tipRows.map((r) => `${r.s.airport.name} ${r.v == null ? r.why : valueText(r.v, metric)}`).join(', ')

  return (
    <>
      <ChartLegend series={series} />
      <div
        ref={box}
        className="chart"
        tabIndex={0}
        role="group"
        aria-label={`${nat} 월별 추이 차트. 좌우 화살표로 달을 옮기면 값을 읽어 줍니다.`}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        data-ui="CHT-01"
      >
        <svg
          viewBox={`0 0 ${w} ${H}`}
          height={H}
          aria-hidden="true"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={w - R} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--grid)' }} />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" style={{ fill: 'var(--muted)' }}>
                {tickLabel(t, metric)}
              </text>
            </g>
          ))}
          {months.map((m, i) =>
            m.endsWith('01') || (!narrow && m.endsWith('07')) ? (
              <g key={m}>
                <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" style={{ fill: 'var(--muted)' }}>
                  {m.slice(2, 4)}.{m.slice(4)}
                </text>
                <line x1={x(i)} x2={x(i)} y1={H - B} y2={H - B + 5} style={{ stroke: 'var(--line)' }} />
              </g>
            ) : null,
          )}
          {div != null && (
            <g>
              <line x1={x(div)} x2={x(div)} y1={T - 6} y2={H - B} strokeDasharray="2 3" style={{ stroke: 'var(--muted)' }} />
              <text x={x(div) + 4} y={T - 8} fontSize="11" style={{ fill: 'var(--muted)' }}>
                외국인 정의 변경({data.definition_change.slice(2).replace(/-/g, '.')})
              </text>
            </g>
          )}
          {series.map((s, si) => {
            if (!s.available) return null
            const color = `var(${airportVar(s.airport.color, si)})`
            let d = ''
            let pen = false
            s.values.forEach((v, i) => {
              if (v == null) {
                pen = false
                return
              }
              d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
              pen = true
            })
            const hi = s.airport.id === targetId
            const last = s.values.reduce<number>((acc, v, i) => (v != null ? i : acc), -1)
            const over = s.values.map((v, i) => (v != null && v > top ? i : -1)).filter((i) => i >= 0)
            return (
              <g key={s.airport.id} opacity={s.passed || metric === 'arr' ? 1 : 0.75}>
                <path
                  d={d}
                  fill="none"
                  strokeWidth={hi ? 3 : 2}
                  strokeDasharray={s.passed || metric === 'arr' ? undefined : '5 4'}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ stroke: color }}
                />
                {over.map((i) => (
                  <path key={i} d={`M${x(i) - 4} ${T + 1} L${x(i)} ${T - 5} L${x(i) + 4} ${T + 1}z`} style={{ fill: color }} />
                ))}
                {last >= 0 && <circle cx={x(last)} cy={y(s.values[last]!)} r={hi ? 4.5 : 3.5} style={{ fill: color }} />}
              </g>
            )
          })}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} style={{ stroke: 'var(--muted)' }} strokeWidth="1" />
              {tipRows.map((r) =>
                r.v == null ? null : (
                  <circle
                    key={r.s.airport.id}
                    cx={x(hover)}
                    cy={y(r.v)}
                    r="4"
                    strokeWidth="2"
                    style={{ fill: 'var(--panel)', stroke: `var(${airportVar(r.s.airport.color, r.si)})` }}
                  />
                ),
              )}
            </g>
          )}
        </svg>
        {hover != null && (
          <div
            className="tip"
            style={x(hover) > w / 2 ? { right: w - x(hover) + 12 } : { left: x(hover) + 12 }}
            aria-hidden="true"
          >
            <b>{fmtYm(months[hover])}</b>
            {tipRows.map((r) => (
              <div key={r.s.airport.id}>
                <span>
                  <span className="sw" style={{ background: `var(${airportVar(r.s.airport.color, r.si)})` }} />
                  {r.s.airport.name}
                  {r.s.available && !r.s.passed && metric !== 'arr' ? ' (참고)' : ''}
                </span>
                {r.v == null ? <span className="na">{r.why}</span> : <span className="num">{valueText(r.v, metric)}</span>}
              </div>
            ))}
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {liveText}
        </p>
      </div>
    </>
  )
}

export function chartNote(metric: Metric, nat: string, minArr: number): string {
  return metric === 'arr'
    ? `${nat} 월별 입국자(관광지식정보시스템 입국관광통계).`
    : `${nat} 기준. 입국 ${minArr}명 미만인 달은 비워 둡니다. 월별 값은 방향 확인용이고 판단은 반기 값으로 합니다. 점선은 연동 검정 미통과(참고)이며 축 범위를 넘는 값은 위쪽 끝에 붙여 ▲로 표시합니다.`
}
