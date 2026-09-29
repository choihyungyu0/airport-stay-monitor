import type { Boundary, BuildingFile, BuildingIndex, Indicators, Meta, SggData, SidoBoundary } from './types'

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

// 건물 레이어: 켤 때 목록을 받고, 줌 14 이상에서 화면에 걸친 구역 파일만 받는다(한 번 받은 파일은 다시 받지 않음)
export const loadBuildingIndex = () => getJson<BuildingIndex>('buildings/index.json')

const areaCache = new Map<string, Promise<BuildingFile>>()
export function loadBuildingArea(file: string): Promise<BuildingFile> {
  let p = areaCache.get(file)
  if (!p) {
    p = getJson<BuildingFile>(`buildings/${file}`)
    p.catch(() => areaCache.delete(file))
    areaCache.set(file, p)
  }
  return p
}
