import type { Airport, Indicators, Metric } from './types'

// UI-03 월별 추이 계열. 입국 300명 미만 달은 null(선 끊김, BR-I2),
// 연동 검정 미통과 공항은 점선이고 축 범위 산정에서 뺀다(BR-I3). 입국자 수는 모든 공항으로 축을 잡는다.

export interface Series {
  airport: Airport
  values: (number | null)[]
  arrivals: (number | null)[]
  passed: boolean
  available: boolean
}

export function buildSeries(data: Indicators, nat: string, metric: Metric): Series[] {
  return data.airports.map((airport) => {
    const b = airport.nat[nat]
    const mo = b?.monthly
    const n = data.months.length
    const values = !mo
      ? Array<number | null>(n).fill(null)
      : metric === 'arr'
        ? mo.arr
        : metric === 'ratio'
          ? mo.ratio
          : mo.per
    return {
      airport,
      values,
      arrivals: mo?.arr ?? Array<number | null>(n).fill(null),
      passed: b?.status === '채택',
      available: !!mo,
    }
  })
}

export function niceStep(raw: number): number {
  const r = raw > 0 ? raw : 1
  const p = Math.pow(10, Math.floor(Math.log10(r)))
  const n = r / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** 축 최댓값: 채택 계열(입국자 수면 전부)의 최댓값을 5칸 눈금으로 올림 */
export function axisTop(series: Series[], metric: Metric): { top: number; step: number } {
  let mx = 0
  for (const s of series) {
    if (!(s.passed || metric === 'arr')) continue
    for (const v of s.values) if (v != null && v > mx) mx = v
  }
  const step = niceStep(mx / 5)
  const top = Math.ceil(mx / step) * step || 1
  return { top, step }
}

export function tickLabel(t: number, metric: Metric): string {
  if (metric === 'ratio') return t.toFixed(t < 10 && t % 1 ? 1 : 0)
  return t >= 10000 ? `${t / 10000}만` : Math.round(t).toLocaleString('ko-KR')
}

/** 월 인덱스 사이 구분선 위치(외국인 정의 변경 이후 첫 달의 직전). 범위 밖이면 null */
export function dividerIndex(months: string[], isoDate: string): number | null {
  const ym = isoDate.replace(/-/g, '').slice(0, 6)
  const i = months.findIndex((m) => m > ym)
  return i > 0 ? i - 0.5 : null
}
