// public/data/*.json 형태. 산출은 scripts/build_data.py가 한다.

export type Judgement = '채택' | '참고값' | '보류' | '자료 없음'

export interface HalfValues {
  arrivals: number
  card: number
  vis_mavg: number | null
  per_arrival_spend: number | null
  visit_ratio: number | null
  /** 인·일당 카드소비 = ① ÷ ② (화면 값 기준) */
  per_day: number | null
}

export interface V2Result {
  lv: number | null
  li: number | null
  dv: number | null
  di: number | null
  pass: boolean
  status: Judgement
  n: number
  window: [string, string] | null
}

export interface NatBlock {
  status: Judgement
  halves?: Record<string, HalfValues>
  v2?: V2Result
  monthly?: {
    arr: (number | null)[]
    vis: (number | null)[]
    card: (number | null)[]
    per: (number | null)[]
    ratio: (number | null)[]
  }
}

export interface Airport {
  id: string
  name: string
  region: string
  color: string
  role: 'target' | 'baseline' | 'compare'
  nat: Record<string, NatBlock>
}

export type Decomposition =
  | { skipped: true; reason: string; nats: string[] }
  | {
      skipped: false
      airport: string
      region: string
      nats: string[]
      base: string
      target: string
      R0: number
      R1: number
      total: number
      pct: number
      comp: number
      rate: Record<string, number>
      r0: Record<string, number>
      r1: Record<string, number>
      s0: Record<string, number>
      s1: Record<string, number>
      residual: number
    }

export interface ScenarioConfig {
  default_days: number
  min_days: number
  max_days: number
  step: number
  default_compare: string
}

export interface Indicators {
  version: number
  months: string[]
  nationalities: string[]
  halves: { base: string; target: string }
  min_monthly_arrivals: number
  definition_change: string
  target: string
  airports: Airport[]
  decomposition: Decomposition
  scenario: ScenarioConfig
  industry: { region: string; periods: Record<string, Record<string, number>> }
}

export interface SggMetric {
  visit_mavg: number | null
  card: number | null
  per_visit: number | null
}

export interface SggItem {
  cd: string
  sgis_cd: string | null
  region: string
  name: string
  full: string
  source: 'raw' | 'table' | 'none'
  nat: Record<string, SggMetric>
  all: SggMetric
}

export interface SggData {
  sido: string
  period: string
  airport_cd: string
  top_n: number
  bins: number[]
  items: SggItem[]
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface ReportCheck {
  id: string
  name: string
  status: CheckStatus
  detail: string
  items?: { sido: string; period: string; status: 'ok' | 'mismatch' | 'skip'; detail: string }[]
}

export interface Validation {
  id: string
  title: string
  status: 'pass' | 'warn' | 'skip' | 'static'
  summary: string
}

export interface V2Row {
  airport: string
  nat: string
  lv: number | null
  li: number | null
  dv: number | null
  di: number | null
  pass: boolean
  status: Judgement
  n: number
  sensitivity: Record<string, boolean>
}

export interface Meta {
  asof: {
    arrivals_latest?: string
    datalab_latest?: string
    datalab_extract?: string | null
    card_extracted_on?: string | null
    card_rebase_date?: string
    halves?: [string, string]
    sgg_period?: string
  }
  sources: string[]
  report: {
    status: 'ok' | 'fail'
    checks: ReportCheck[]
    consistency: { mismatch: number; skipped: number; checked: number }
    validations: Validation[]
    v2_table: V2Row[]
    log: { level: string; code: string; msg: string }[]
  }
}

export interface BoundaryFeature {
  type: 'Feature'
  properties: { cd: string; sgis_cd: string; name: string; full: string; cx: number; cy: number }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
}

export interface Boundary {
  type: 'FeatureCollection'
  features: BoundaryFeature[]
}

export type Metric = 'ratio' | 'card' | 'arr'
export type Basemap = 'none' | 'gray' | 'satellite'
