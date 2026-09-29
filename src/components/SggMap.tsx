import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Marker, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import { fmt, fmtMil } from '../lib/format'
import { cssVar, effectiveTheme, useThemeVersion } from '../lib/theme'
import type { Basemap, Boundary, BoundaryFeature, SggData, SggItem } from '../lib/types'
import { Segmented } from './Segmented'

// UI-04·05 충북 시군구 단계구분도(MAP-01). 색 = 방문 1회당 카드소비, 원 = 월평균 방문.
// 배경은 V-World 타일만 쓴다(BR-U3: 타 지도사 타일 금지, 최대 줌 12, 공항 시설 표시 금지).

export const RAMP = ['#eef1f6', '#cdd7e8', '#9fb3d6', '#5a7fb8', '#27497f']
const VWORLD_KEY: string = import.meta.env.VITE_VWORLD_KEY ?? ''
const MAX_ZOOM = 12
const FILL_OPACITY: Record<Basemap, number> = { none: 1, gray: 0.78, satellite: 0.55 }
const BG_LABEL: Record<Exclude<Basemap, 'none'>, string> = { gray: '지도', satellite: '위성' }
const LABELED = new Set(['43111', '43112', '43113', '43114', '43130', '43150', '43800'])

/** V-World WMTS 레이어. 회색 지도는 white(밝은 화면)·midnight(어두운 화면), 위성은 Satellite. */
function tileUrl(b: Exclude<Basemap, 'none'>): string {
  const [layer, ext] = b === 'satellite' ? ['Satellite', 'jpeg'] : [effectiveTheme() === 'dark' ? 'midnight' : 'white', 'png']
  return `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${layer}/{z}/{y}/{x}.${ext}`
}

const won = (n: number) => (n >= 10000 ? `${n / 10000}만` : n >= 1000 ? `${n / 1000}천` : String(n))

export function binLabels(bins: number[]): string[] {
  return [`${won(bins[0])}원 미만`, ...bins.slice(1).map((b, i) => `${won(bins[i])}~${won(b)}`), `${won(bins[bins.length - 1])}원 이상`]
}

export const binColor = (v: number | null, bins: number[]) => (v == null ? null : RAMP[bins.filter((b) => v >= b).length])

interface MapProps {
  boundary: Boundary | null | 'error'
  sgg: SggData
  nat: string
  active: string | null
  pinned: string | null
  onHover: (cd: string | null) => void
  onPin: (cd: string | null) => void
  onToast: (msg: string) => void
}

export function SggMap({ boundary, sgg, nat, active, pinned, onHover, onPin, onToast }: MapProps) {
  const [basemap, setBasemap] = useState<Basemap>('none')
  const theme = useThemeVersion()
  const byCd = useMemo(() => new Map(sgg.items.map((i) => [i.cd, i])), [sgg])
  const geoRef = useRef<L.GeoJSON>(null)
  const tiles = useRef({ ok: 0, err: 0 })
  // Leaflet 이벤트는 레이어 생성 때 한 번 묶이므로 최신 핸들러·고정 상태는 ref로 읽는다.
  const live = useRef({ onHover, onPin, pinned })
  useEffect(() => {
    live.current = { onHover, onPin, pinned }
  })

  // ST-08: 키가 없으면 바로 "배경 없음"으로 되돌리고 안내한다.
  const choose = (b: Basemap) => {
    if (b !== 'none' && !VWORLD_KEY) {
      onToast(`${BG_LABEL[b]} 배경을 불러오지 못했습니다. V-World 인증키(VITE_VWORLD_KEY)가 없어 배경 없이 표시합니다.`)
      setBasemap('none')
      return
    }
    tiles.current = { ok: 0, err: 0 }
    setBasemap(b)
  }

  const style = useMemo(() => {
    const line = basemap === 'satellite' ? '#ffffff' : cssVar('--panel')
    const ink = basemap === 'satellite' ? '#ffffff' : cssVar('--ink')
    const none = cssVar('--no-bg')
    return (f?: GeoJSON.Feature): L.PathOptions => {
      const cd = (f?.properties as BoundaryFeature['properties'] | undefined)?.cd ?? ''
      const v = byCd.get(cd)?.nat[nat]?.per_visit ?? null
      const on = cd === active
      return { fillColor: binColor(v, sgg.bins) ?? none, fillOpacity: FILL_OPACITY[basemap], color: on ? ink : line, weight: on ? 3 : 1.2 }
    }
  }, [byCd, nat, active, basemap, sgg.bins, theme])

  useEffect(() => {
    geoRef.current?.setStyle(style as L.StyleFunction)
    if (active)
      geoRef.current?.eachLayer((l) => {
        const cd = ((l as L.Polygon).feature?.properties as BoundaryFeature['properties'] | undefined)?.cd
        if (cd === active) (l as L.Polygon).bringToFront()
      })
  }, [style, active])

  const bounds = useMemo(
    () => (boundary && boundary !== 'error' ? L.geoJSON(boundary as GeoJSON.FeatureCollection).getBounds() : null),
    [boundary],
  )

  const accent = cssVar('--accent')
  // 원은 페이지가 아니라 채색(밝은~짙은 파랑) 위에 놓이므로 테마와 무관하게 짙은 선, 위성 위에서는 흰 선
  const ink = basemap === 'satellite' ? '#ffffff' : '#14191f'
  const info = active ? byCd.get(active) : undefined

  return (
    <div>
      <div
        className={`mapbox${basemap === 'satellite' ? ' sat' : ''}`}
        data-ui="MAP-01"
        role="region"
        aria-label={`${sgg.sido} 시군구 지도(${nat})`}
        onMouseLeave={() => onHover(null)}
      >
        {boundary === 'error' ? (
          <div className="mapnotice" role="status">
            시군구 경계를 불러오지 못해 지도를 표시하지 않습니다. 오른쪽 요약과 시군구 표에서 같은 값을 볼 수 있습니다.
          </div>
        ) : !boundary || !bounds ? (
          <div className="mapnotice">지도를 불러오는 중…</div>
        ) : (
          <>
            <div className="map-bg">
              <Segmented
                ui="SEG-03"
                small
                label="배경지도 선택"
                value={basemap}
                onChange={choose}
                options={[
                  { value: 'none', label: '배경 없음' },
                  { value: 'gray', label: '지도' },
                  { value: 'satellite', label: '위성' },
                ]}
              />
            </div>
            <MapContainer
              bounds={bounds}
              boundsOptions={{ padding: [16, 16] }}
              maxZoom={MAX_ZOOM}
              minZoom={7}
              scrollWheelZoom={false}
              dragging={!L.Browser.mobile}
              zoomSnap={0.25}
              zoomControl={false}
              attributionControl
            >
              <FitBounds bounds={bounds} />
              <ZoomControl position="bottomright" />
              {basemap !== 'none' && (
                <TileLayer
                  key={`${basemap}-${theme}`}
                  url={tileUrl(basemap)}
                  attribution="국토교통부 브이월드"
                  maxZoom={MAX_ZOOM}
                  maxNativeZoom={MAX_ZOOM}
                  eventHandlers={{
                    tileload: () => {
                      tiles.current.ok += 1
                    },
                    tileerror: () => {
                      tiles.current.err += 1
                      if (tiles.current.ok === 0 && tiles.current.err >= 2) {
                        onToast(`${BG_LABEL[basemap]} 배경을 불러오지 못했습니다. 배경 없이 표시합니다.`)
                        setBasemap('none')
                      }
                    },
                  }}
                />
              )}
              <GeoJSON
                ref={geoRef}
                data={boundary as GeoJSON.FeatureCollection}
                style={style as L.StyleFunction}
                onEachFeature={(f, layer) => {
                  const cd = (f.properties as BoundaryFeature['properties']).cd
                  layer.on({
                    mouseover: () => live.current.onHover(cd),
                    mouseout: () => live.current.onHover(null),
                    click: () => live.current.onPin(live.current.pinned === cd ? null : cd),
                  })
                }}
              />
              {boundary.features.map((f) => {
                const p = f.properties
                const v = byCd.get(p.cd)?.nat[nat]?.visit_mavg
                if (!v) return null
                const hl = p.cd === sgg.airport_cd
                return (
                  <CircleMarker
                    key={`${p.cd}-${theme}-${basemap}`}
                    center={[p.cy, p.cx]}
                    radius={Math.sqrt(v) * 0.3}
                    interactive={false}
                    pathOptions={{ fill: false, color: hl ? accent : ink, weight: hl ? 3 : 1.2, opacity: hl ? 1 : 0.75 }}
                  />
                )
              })}
              {boundary.features
                .filter((f) => LABELED.has(f.properties.cd))
                .map((f) => (
                  <Marker
                    key={f.properties.cd}
                    position={[f.properties.cy, f.properties.cx]}
                    interactive={false}
                    keyboard={false}
                    icon={L.divIcon({
                      className: 'sgg-label',
                      iconSize: [0, 0],
                      html: `<span style="margin-top:${f.properties.cd.startsWith('4311') ? -12 : 0}px">${f.properties.name}</span>`,
                    })}
                  />
                ))}
            </MapContainer>
          </>
        )}
        {info && boundary !== 'error' && (
          <MapInfo item={info} nat={nat} airportCd={sgg.airport_cd} pinned={pinned === info.cd} onClose={() => onPin(null)} />
        )}
      </div>
      <div className="legend" data-ui="LGD-02">
        <span>방문 1회당</span>
        {binLabels(sgg.bins).map((l, i) => (
          <span key={l}>
            <i className="sw" style={{ background: RAMP[i] }} />
            {l}
          </span>
        ))}
        <span>
          <i className="ring" /> 월평균 방문
        </span>
        <span>
          <i className="ring hl" /> 공항 소재 구
        </span>
      </div>
    </div>
  )
}

/** 컨테이너 크기가 정해진 뒤·바뀔 때마다 충북 전체가 보이게 맞춘다(모바일 회전 등). */
function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap()
  useEffect(() => {
    const fit = () => {
      map.invalidateSize()
      map.fitBounds(bounds, { padding: [16, 16] })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map, bounds])
  return null
}

function MapInfo({ item, nat, airportCd, pinned, onClose }: { item: SggItem; nat: string; airportCd: string; pinned: boolean; onClose: () => void }) {
  const v = item.nat[nat]
  return (
    <div className="mapinfo" role="status">
      {pinned && (
        <button type="button" aria-label="정보 닫기" onClick={onClose}>
          ×
        </button>
      )}
      <b>
        {item.full}
        {item.cd === airportCd ? ' (공항)' : ''}
      </b>
      <dl>
        <div>
          <dt>방문 1회당</dt>
          <dd>{v?.per_visit == null ? '자료 없음' : `${fmt(v.per_visit)}원`}</dd>
        </div>
        <div>
          <dt>월평균 방문</dt>
          <dd>{fmt(v?.visit_mavg)}명</dd>
        </div>
        <div>
          <dt>카드(반기)</dt>
          <dd>{fmtMil(v?.card)}백만원</dd>
        </div>
      </dl>
    </div>
  )
}
