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

export interface Lodging {
  total: number
  hotel: number
}

export interface Airport {
  id: string
  name: string
  region: string
  color: string
  role: 'target' | 'baseline' | 'compare'
  /** 지도 표시용 점(소수 둘째 자리) */
  lat?: number
  lng?: number
  /** 공군과 활주로를 같이 쓰는 공항 — 확대 제한 대상 */
  military_shared?: boolean
  /** 반경별 숙박 공급: { "5": {...}, "10": {...} } */
  lodging?: Record<string, Lodging>
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
  supply?: { source: string; note: string; radii_km: number[] }
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

export interface ContentPin {
  name: string
  region: string
  cd: string
  representative: boolean
  place: string
  address: string
  lat: number
  lng: number
  looked_up_on: string
  verified_on: string | null
}

export interface SggData {
  sido: string
  period: string
  airport_cd: string
  top_n: number
  bins: number[]
  items: SggItem[]
  pins?: { source: string; items: ContentPin[] }
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

export interface SidoBoundary {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: { sgis_cd: string; region: string }; geometry: { type: 'MultiPolygon'; coordinates: unknown } }[]
}

export type Metric = 'ratio' | 'card' | 'arr'
export type Basemap = 'satellite' | 'gray' | 'none'

/** 건물 클릭 레이어(public/data/buildings). 건물별 외국인 소비·방문 값은 없다 — 시군구 값은 화면에서 「시군구 평균」으로 붙인다. */
export type BuildingKind = 'lodging' | 'retail_food' | 'other'

export interface BuildingProps {
  id: string
  /** 색 구분: 숙박시설 / 근린생활·판매시설 / 그 밖 */
  k: BuildingKind
  /** 주용도 이름(건축물대장 주용도코드) */
  use: string | null
  fl: number | null
  /** 사용승인연도 */
  yr: number | null
  nm: string | null
  /** 건물 안 업소 수 [숙박, 음식, 소매] */
  n: [number, number, number]
  /** 상호 최대 10곳 [상호, 업종] */
  shops: [string, string][]
  /** 청주공항까지 직선거리(km, 소수 1자리) */
  km: number
  cy: number
  cx: number
}

export interface BuildingFile {
  type: 'FeatureCollection'
  cd: string
  features: { type: 'Feature'; properties: BuildingProps; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }[]
}

export interface BuildingArea {
  cd: string
  label: string
  file: string
  count: number
  kinds: Partial<Record<BuildingKind, number>>
  /** [서, 남, 동, 북] */
  bbox: [number, number, number, number]
  /** 바로 가기 지점 [위도, 경도] — 건물이 가장 많이 모인 곳 */
  focus: [number, number]
}

export interface BuildingIndex {
  collected: string
  shops_period: string
  sources: { building: string; shops: string }
  categories: string[]
  min_shops: number
  protect_km: number
  protected: string[]
  /** 보호구역 안 업소 — 위치 없이 개수만 */
  hidden_shops: Record<string, Record<string, number>>
  match: Record<string, number>
  areas: BuildingArea[]
}
