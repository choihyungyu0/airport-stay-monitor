import type { Airport, Indicators } from './types'

// IND-06 · BR-I5 체류 증가 시나리오.
// low = N × d × (①÷②)대상, high = N × d × (①÷②)비교공항. 카드 기준 하한값이다.

export interface ScenarioResult {
  arrivals: number
  days: number
  perDayTarget: number
  perDayCompare: number
  low: number
  high: number
  compareIsReference: boolean
}

/** 효과 계산 입력. arrivals가 null이면 비교 반기 실적을 쓴다. budget은 억 원. */
export interface ScenarioInput {
  days: number
  compare: string
  arrivals: number | null
  budget: number | null
}

export function clampDays(d: number, min = 0, max = 2): number {
  if (Number.isNaN(d)) return min
  return Math.min(max, Math.max(min, d))
}

export function computeScenario(
  data: Indicators,
  nat: string,
  days: number,
  compareId: string,
  arrivalsOverride: number | null = null,
): ScenarioResult | null {
  const target = data.airports.find((a) => a.id === data.target)
  const compare = data.airports.find((a) => a.id === compareId)
  if (!target || !compare) return null
  const t = target.nat[nat]?.halves?.[data.halves.target]
  const c = compare.nat[nat]?.halves?.[data.halves.target]
  if (!t?.per_day || !c?.per_day) return null
  const d = clampDays(days, data.scenario.min_days, data.scenario.max_days)
  const n = arrivalsOverride != null && arrivalsOverride >= 0 ? arrivalsOverride : t.arrivals
  const a = n * d * t.per_day
  const b = n * d * c.per_day
  return {
    arrivals: n,
    days: d,
    perDayTarget: t.per_day,
    perDayCompare: c.per_day,
    low: Math.min(a, b),
    high: Math.max(a, b),
    compareIsReference: compare.nat[nat]?.status !== '채택',
  }
}

export const compareCandidates = (data: Indicators): Airport[] =>
  data.airports.filter((a) => a.id !== data.target)
