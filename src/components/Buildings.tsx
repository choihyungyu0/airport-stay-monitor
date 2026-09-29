import type L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, GeoJSON, Pane, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { loadBuildingArea } from '../lib/data'
import { fmt } from '../lib/format'
import type { Airport, BuildingArea, BuildingFile, BuildingIndex, BuildingKind, BuildingProps, SggData } from '../lib/types'

// 건물 클릭 레이어(지시서 8장). 지표 결과(청원구 방문 1회당 1,975원 · 흥덕구 29,321원)를 건물 단위 숙박·음식·소매 공급으로 본다.
// 건물별 외국인 소비·방문 값은 없어서 만들지 않는다. 시군구 값은 「시군구 평균」으로만 붙인다.

/** 기본 최대 줌(시군구 규모). 건물 레이어를 켠 때만 17까지 */
export const MAX_ZOOM = 12
export const MAX_ZOOM_BUILDINGS = 17
/** 건물 윤곽은 줌 14부터 */
export const BUILDING_MIN_ZOOM = 14
/** 공항 보호구역 마스크는 줌 13부터 */
export const PROTECT_MIN_ZOOM = 13
export const PROTECT_KM = 3

export const maxZoomFor = (buildings: boolean) => (buildings ? MAX_ZOOM_BUILDINGS : MAX_ZOOM)

/** "2026-06" → "2026.6" */
const ym = (s: string) => {
  const [y, m] = s.split('-')
  return m ? `${y}.${Number(m)}` : s
}

/** 건물 이름이 없으면 대표 업소(숙박 → 음식 → 소매 순 첫 곳) 이름으로 부른다 */
export const buildingTitle = (p: BuildingProps): string => p.nm ?? (p.shops[0] ? `${p.shops[0][0]} 건물` : `이름 없는 ${p.use ?? '건물'}`)

export const KIND_COLOR: Record<BuildingKind, string> = { lodging: '#f5b800', retail_food: '#3fd0c0', other: '#c9ced4' }
export const KIND_LABEL: Record<BuildingKind, string> = { lodging: '숙박시설', retail_food: '근린생활·판매시설', other: '그 밖(업소 3곳 이상)' }

export interface Picked {
  p: BuildingProps
  cd: string
}

/** 켜고 끌 때 지도 최대 줌을 바꾼다. 끄면 12보다 가까이 있던 화면을 12로 되돌린다. */
export function ZoomLimit({ max }: { max: number }) {
  const map = useMap()
  useEffect(() => {
    map.setMaxZoom(max)
    if (map.getZoom() > max) map.setZoom(max, { animate: false })
  }, [map, max])
  return null
}

export function useZoom(): number {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  return zoom
}

/** 공군과 활주로를 같이 쓰는 공항 중심 3km: 줌 13 이상이면 불투명 마스크로 덮는다(위성·라벨·건물 모두 가림). */
export function ProtectMask({ airports }: { airports: Airport[] }) {
  const zoom = useZoom()
  if (zoom < PROTECT_MIN_ZOOM) return null
  return (
    <Pane name="protect" style={{ zIndex: 620 }}>
      {airports
        .filter((a) => a.military_shared && a.lat != null && a.lng != null)
        .map((a) => (
          <Circle
            key={a.id}
            center={[a.lat!, a.lng!]}
            radius={PROTECT_KM * 1000}
            interactive={false}
            pathOptions={{ color: '#f5b800', weight: 1.5, dashArray: '6 6', fillColor: '#0a0e14', fillOpacity: 1 }}
          >
            {/* 라벨은 마스크(620) 위 툴팁 칸(650)에. 같은 칸에 두면 원(SVG) 아래에 깔린다 */}
            <Tooltip permanent direction="center" className="protect-tip" pane="tooltipPane">
              공항 보호구역 · 확대 표시 안 함
            </Tooltip>
          </Circle>
        ))}
    </Pane>
  )
}

const intersects = (b: L.LatLngBounds, [w, s, e, n]: BuildingArea['bbox']) =>
  !(e < b.getWest() || w > b.getEast() || n < b.getSouth() || s > b.getNorth())

/** 줌 14 이상에서 화면에 걸친 구역 파일만 받아 윤곽을 그린다. 색 = 주용도(숙박 노랑 · 근린생활·판매 청록 · 그 밖 회색 테두리). */
export function BuildingLayer({ index, picked, onPick, onError }: { index: BuildingIndex; picked: string | null; onPick: (b: Picked) => void; onError: () => void }) {
  const map = useMap()
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }))
  const [files, setFiles] = useState<Record<string, BuildingFile>>({})
  useMapEvents({ moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }) })
  const on = view.zoom >= BUILDING_MIN_ZOOM
  const want = useMemo(() => (on ? index.areas.filter((a) => intersects(view.bounds, a.bbox)) : []), [on, index, view.bounds])

  useEffect(() => {
    let alive = true
    for (const a of want) {
      if (files[a.cd]) continue
      loadBuildingArea(a.file)
        .then((f) => alive && setFiles((x) => ({ ...x, [a.cd]: f })))
        .catch(() => alive && onError())
    }
    return () => {
      alive = false
    }
  }, [want, files, onError])

  if (!on) return null
  return (
    <>
      {want.map((a) => (files[a.cd] ? <AreaLayer key={a.cd} cd={a.cd} file={files[a.cd]} picked={picked} onPick={onPick} /> : null))}
    </>
  )
}

const styleOf = (picked: string | null) => (f?: GeoJSON.Feature): L.PathOptions => {
  const p = f?.properties as BuildingProps
  const c = KIND_COLOR[p.k]
  const sel = p.id === picked
  return { color: sel ? '#ffffff' : c, weight: sel ? 3 : p.k === 'other' ? 1.2 : 1.4, opacity: 1, fillColor: c, fillOpacity: p.k === 'other' ? 0 : sel ? 0.55 : 0.32 }
}

/** 구역 파일 하나. 고른 건물이 바뀌면 다시 그리지 않고 스타일만 바꾼다. */
function AreaLayer({ cd, file, picked, onPick }: { cd: string; file: BuildingFile; picked: string | null; onPick: (b: Picked) => void }) {
  const ref = useRef<L.GeoJSON>(null)
  const live = useRef(onPick)
  useEffect(() => {
    live.current = onPick
  })
  useEffect(() => {
    ref.current?.setStyle(styleOf(picked) as L.StyleFunction)
  }, [picked])
  return (
    <GeoJSON
      ref={ref}
      data={file as unknown as GeoJSON.FeatureCollection}
      style={styleOf(picked) as L.StyleFunction}
      onEachFeature={(f, layer) => {
        const p = f.properties as BuildingProps
        layer.on('click', () => live.current({ p, cd }))
      }}
    />
  )
}

interface PanelProps {
  index: BuildingIndex | null
  error: boolean
  sgg: SggData
  nat: string
  zoom: number
  picked: Picked | null
  lodging?: Record<string, { total: number; hotel: number }>
  onJump: (a: BuildingArea) => void
  onClear: () => void
  onOff: () => void
}

/** 건물 레이어를 켠 때의 패널: 가까이 볼 곳 → 건물을 누르면 주용도·층수·사용승인연도·업소 목록·시군구 평균 */
export function BuildingPanel({ index, error, sgg, nat, zoom, picked, lodging, onJump, onClear, onOff }: PanelProps) {
  const hidden = index ? Object.values(index.hidden_shops).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0) : 0
  return (
    <div className="sggp bldp">
      <div className="sggp-top">
        <button type="button" className="back" onClick={onOff}>
          ← 시군구 표
        </button>
        {picked && (
          <button type="button" className="back" onClick={onClear}>
            다른 건물
          </button>
        )}
      </div>
      <p className="fids-label">건물 · 숙박·음식·소매 업소{index ? ` · 상가(상권)정보 ${ym(index.shops_period)}` : ''}</p>
      {error ? (
        <p className="sggp-line" role="alert">
          건물 자료를 불러오지 못했습니다. 새로고침해 주세요.
        </p>
      ) : !index ? (
        <div className="stage-wait" aria-label="불러오는 중">
          <div className="skel" style={{ height: 22, width: '70%' }} />
          <div className="skel" style={{ height: 120, marginTop: 12 }} />
        </div>
      ) : picked ? (
        <BuildingDetail picked={picked} sgg={sgg} nat={nat} index={index} />
      ) : (
        <>
          <h2 className="sggp-title">{zoom < BUILDING_MIN_ZOOM ? '가까이 볼 곳을 고르세요. 줌 14부터 건물이 보입니다' : '건물을 누르면 안에 있는 숙박·음식·소매 업소가 보입니다'}</h2>
          <div className="bld-areas" role="group" aria-label="가까이 볼 곳">
            {index.areas.map((a) => (
              <button key={a.cd} type="button" onClick={() => onJump(a)}>
                {a.label}
                <span>{fmt(a.count)}동</span>
              </button>
            ))}
          </div>
        </>
      )}
      {lodging && (
        <p className="sggp-line bld-supply">
          청주공항 반경 5km 숙박업소 {fmt(lodging['5']?.total)}곳(호텔 {fmt(lodging['5']?.hotel)}) · 10km {fmt(lodging['10']?.total)}곳(호텔 {fmt(lodging['10']?.hotel)})
        </p>
      )}
      <div className="legend" data-ui="LGD-03">
        {(Object.keys(KIND_LABEL) as BuildingKind[]).map((k) => (
          <span key={k}>
            <i className={`bsw ${k}`} />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>
      {index && (
        <p className="bld-note">
          숙박시설이거나 숙박·음식·소매 업소가 {index.min_shops}곳 이상인 건물만 보입니다. 공항 보호구역(청주공항 {index.protect_km}km) 안 업소{' '}
          {fmt(hidden)}곳은 위치 없이 개수만 셉니다.
        </p>
      )}
    </div>
  )
}

function BuildingDetail({ picked, sgg, nat, index }: { picked: Picked; sgg: SggData; nat: string; index: BuildingIndex }) {
  const { p, cd } = picked
  const it = sgg.items.find((i) => i.cd === cd)
  const v = it?.nat[nat]
  const total = p.n.reduce((a, b) => a + b, 0)
  return (
    <div className="bld-detail" aria-live="polite">
      <h2 className="sggp-title">{buildingTitle(p)}</h2>
      <p className="pop-sub">
        {it?.full ?? cd}
        {p.nm ? '' : ' · 건물 이름 없음'}
      </p>
      <div className="pop-rows">
        <div>
          <span>주용도</span>
          <span>{p.use ?? '–'}</span>
        </div>
        <div>
          <span>지상층수</span>
          <span>{p.fl ? `${p.fl}층` : '–'}</span>
        </div>
        <div>
          <span>사용승인연도</span>
          <span>{p.yr ? `${p.yr}년` : '–'}</span>
        </div>
        <div>
          <span>청주공항까지 직선거리</span>
          <span>{p.km.toFixed(1)}km</span>
        </div>
      </div>
      <h3 className="bld-h">건물 안 업소 {fmt(total)}곳</h3>
      <p className="bld-counts">
        {index.categories.map((c, i) => (
          <span key={c} className={`chip c${i}`}>
            {c} {fmt(p.n[i])}
          </span>
        ))}
      </p>
      {p.shops.length > 0 && (
        <ul className="bld-shops">
          {p.shops.map(([name, cat], i) => (
            <li key={`${name}-${i}`}>
              <span className={`chip c${index.categories.indexOf(cat)}`}>{cat}</span>
              {name}
            </li>
          ))}
          {total > p.shops.length && <li className="more">외 {fmt(total - p.shops.length)}곳</li>}
        </ul>
      )}
      <h3 className="bld-h">
        {it?.full ?? cd} 전체 {nat}인 <em>시군구 평균</em>
      </h3>
      <div className="pop-rows">
        <div>
          <span>월평균 방문(시군구 평균)</span>
          <span>{v?.visit_mavg == null ? '–' : `${fmt(v.visit_mavg)}명`}</span>
        </div>
        <div>
          <span>방문 1회당 카드소비(시군구 평균)</span>
          <span>{v?.per_visit == null ? '–' : `${fmt(v.per_visit)}원`}</span>
        </div>
      </div>
      <p className="bld-note">건물별 외국인 방문·소비 값은 없습니다. 위 두 값은 이 건물이 있는 시군구 전체의 평균입니다.</p>
      <p className="src">
        출처: {index.sources.building}, {index.collected} 받음 · {index.sources.shops}
      </p>
    </div>
  )
}
