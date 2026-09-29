import type { Boundary, Indicators, Meta, SggData, SidoBoundary } from './types'

// 산출 JSON 로딩. 지표·시군구는 필수(실패 시 ST-03), 메타와 경계는 따로 실패를 처리한다(ST-10, ST-07).

const base = import.meta.env.BASE_URL

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(`${base}data/${name}`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${name} ${res.status}`)
  return (await res.json()) as T
}

export interface CoreData {
  indicators: Indicators
  sgg: SggData
  meta: Meta | null
}

export async function loadCore(): Promise<CoreData> {
  const [indicators, sgg, meta] = await Promise.all([
    getJson<Indicators>('indicators.json'),
    getJson<SggData>('sgg.json'),
    getJson<Meta>('meta.json').catch(() => null),
  ])
  if (!indicators?.airports?.length || !sgg?.items) throw new Error('산출 JSON 형식 오류')
  return { indicators, sgg, meta }
}

export const loadBoundary = () => getJson<Boundary>('boundary_43.geojson')

export const loadSido = () => getJson<SidoBoundary>('boundary_sido.geojson')
