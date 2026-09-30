import L from 'leaflet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, GeoJSON, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import { loadBuildingIndex } from '../lib/data'
import { fmt, fmtMil } from '../lib/format'
import { loadFonts } from '../lib/fonts'
import { distanceKm, prefersReducedMotion } from '../lib/geo'
import { binColor } from '../lib/ramp'
import { iata, mapStory } from '../lib/story'
import type { Basemap, Boundary, BoundaryFeature, BuildingArea, BuildingIndex, ContentPin, Indicators, Meta, SggData, SidoBoundary } from '../lib/types'
import { BuildingLayer, BuildingPanel, MAX_ZOOM, MAX_ZOOM_BUILDINGS, maxZoomFor, PROTECT_MIN_ZOOM, ProtectMask, ZoomLimit, type Picked } from './Buildings'
import { FidsPanel, SggPanel } from './StagePanels'

// 지도 탭 첫 화면: 전면 위성지도. 1장면 = 전국(공항 4곳), 2장면 = 청주 권역(충북 시군구 단계구분도).
// 배경은 V-World 타일만(위성 + 하이브리드 라벨, 지도 = midnight). 최대 줌 12, 공항 시설·활주로 표시 없음.
// 청주 권역에서 「숙박·음식 건물」을 켠 때만 최대 줌 17(줌 14부터 건물 윤곽). 공항 보호구역 3km는 줌 13부터 불투명 마스크.

const KEY: string = import.meta.env.VITE_VWORLD_KEY ?? ''
const vw = (layer: string, ext: string) => `https://api.vworld.kr/req/wmts/1.0.0/${KEY}/${layer}/{z}/{y}/{x}.${ext}`
const KOREA: L.LatLngBoundsExpression = [
  [33.1, 125.0],
  [38.6, 129.6],
]
const CHEONGJU: [number, number] = [36.64, 127.49]
const SIGN = '#f5b800'
const FILL: Record<Basemap, number> = { satellite: 0.55, gray: 0.75, none: 0.9 }
const LABELED = new Set(['43111', '43112', '43113', '43114', '43130', '43150', '43800'])

export type Scene = 'korea' | 'cheongju'

interface Props {
  /** 자료가 오기 전(null)에도 지도·타일은 먼저 띄운다 */
  data: Indicators | null
  sgg: SggData | null
  meta: Meta | null
  nat: string
  boundary: Boundary | null | 'error'
  sido: SidoBoundary | null
  onToast: (m: string) => void
}

export function MapStage({ data, sgg, meta, nat, boundary, sido, onToast }: Props) {
  const [scene, setScene] = useState<Scene>('korea')
  const [basemap, setBasemap] = useState<Basemap>(KEY ? 'satellite' : 'none')
  const [selected, setSelected] = useState<string | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState(false)
  const [zoom, setZoom] = useState(0)
  // 건물 레이어(청주 권역 장면에서만)
  const [bld, setBld] = useState(false)
  const [bIndex, setBIndex] = useState<BuildingIndex | null>(null)
  const [bErr, setBErr] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [jump, setJump] = useState<{ to: [number, number]; seq: number } | null>(null)
  const onBErr = useCallback(() => setBErr(true), [])

  const toggleBld = () => {
    if (bld) {
      setBld(false)
      setPicked(null)
      return
    }
    setBld(true)
    setBErr(false)
    if (!bIndex)
      loadBuildingIndex()
        .then(setBIndex)
        .catch(() => setBErr(true))
  }
  const jumpTo = (a: BuildingArea) => {
    setPicked(null)
    setJump((j) => ({ to: a.focus, seq: (j?.seq ?? 0) + 1 }))
  }

  const choose = (b: Basemap) => {
    if (b !== 'none' && !KEY) {
      onToast('V-World 인증키(VITE_VWORLD_KEY)가 없어 배경 없이 표시합니다.')
      return
    }
    setBasemap(b)
  }
  // 타일 실패: 위성 → 지도 → 배경 없음 순으로 물러난다
  const onTileFail = (b: Basemap) => {
    if (b === 'satellite') {
      setBasemap('gray')
      onToast('위성 배경을 불러오지 못해 지도 배경으로 바꿨습니다.')
    } else if (b === 'gray') {
      setBasemap('none')
      onToast('지도 배경을 불러오지 못해 배경 없이 표시합니다.')
    }
  }

  const goScene = (s: Scene) => {
    setScene(s)
    setSelected(null)
    setMonth(null)
    setHover(null)
    setPinned(null)
    setBld(false)
    setPicked(null)
  }
  const buildings = bld && scene === 'cheongju'
  // 모바일(지도 위·패널 아래 배치): 전국 보기(줌 7 이하)에서는 도시명 라벨이 공항 라벨과 겹쳐 하이브리드를 빼고, 공항 라벨을 원에서 더 띄운다
  const narrow = typeof window !== 'undefined' && window.innerWidth <= 760

  return (
    <section className={`stage scene-${scene}`} aria-label="지도" id="map">
      <MapContainer
        bounds={KOREA}
        maxZoom={MAX_ZOOM}
        minZoom={6}
        zoomSnap={0.25}
        fadeAnimation={false}
        scrollWheelZoom={false}
        dragging={!L.Browser.mobile}
        zoomControl={false}
        attributionControl
        className="stage-map"
      >
        <ZoomControl position="bottomright" />
        <InitialView onDone={() => setPlaced(true)} />
        <ZoomLimit max={maxZoomFor(buildings)} />
        <ZoomWatch onZoom={setZoom} />
        {/* 하이브리드 라벨: 전국 보기, 그리고 건물을 볼 만큼 가까이(줌 13+) 갔을 때 길 이름을 찾도록 */}
        {placed && <Tiles basemap={basemap} labels={(scene === 'korea' && !(narrow && zoom <= 7)) || (buildings && zoom >= PROTECT_MIN_ZOOM)} faint={buildings} onFail={onTileFail} />}
        {data && placed && <View scene={scene} selected={selected} data={data} panel={panel} />}
        {jump && <Jump key={jump.seq} to={jump.to} panel={panel} />}
        {data && <ProtectMask airports={data.airports} />}
        {data && scene === 'korea' && (
          <>
            {selected && sido && <SidoHighlight sido={sido} region={data.airports.find((a) => a.id === selected)?.region} target={selected === data.target} />}
            <Rings data={data} />
            <Airports data={data} nat={nat} month={month} onSelect={setSelected} gap={narrow ? 8 : 2} />
          </>
        )}
        {data && sgg && scene === 'cheongju' && boundary && boundary !== 'error' && (
          <Cheongju
            data={data}
            sgg={sgg}
            nat={nat}
            boundary={boundary}
            basemap={basemap}
            active={hover ?? pinned}
            onHover={setHover}
            onPin={(cd) => setPinned((p) => (p === cd ? null : cd))}
            quiet={buildings}
          />
        )}
        {buildings && bIndex && <BuildingLayer index={bIndex} picked={picked?.p.id ?? null} onPick={setPicked} onError={onBErr} />}
      </MapContainer>

      <div className="stage-bg" role="group" aria-label="배경지도 선택" data-ui="SEG-03">
        {(['satellite', 'gray', 'none'] as Basemap[]).map((b) => (
          <button key={b} type="button" aria-pressed={basemap === b} onClick={() => choose(b)}>
            {b === 'satellite' ? '위성' : b === 'gray' ? '지도' : '배경 없음'}
          </button>
        ))}
      </div>

      {scene === 'cheongju' && data && (
        <button type="button" className="stage-bld" aria-pressed={bld} onClick={toggleBld}>
          <i aria-hidden="true" />
          숙박·음식 건물
        </button>
      )}

      <div ref={panel} className={`stage-panel ${scene === 'korea' ? 'left' : 'right'}${buildings ? ' bld' : ''}`} aria-busy={!data}>
        {!data || !sgg ? (
          <div className="stage-wait" aria-label="불러오는 중">
            <div className="skel" style={{ height: 22, width: '60%' }} />
            <div className="skel" style={{ height: 180, marginTop: 14 }} />
          </div>
        ) : scene === 'korea' ? (
          <FidsPanel data={data} meta={meta} nat={nat} selected={selected} onSelect={setSelected} month={month} onMonth={setMonth} onScene={() => goScene('cheongju')} />
        ) : buildings ? (
          <BuildingPanel
            index={bIndex}
            error={bErr}
            sgg={sgg}
            nat={nat}
            zoom={zoom}
            picked={picked}
            lodging={data.airports.find((a) => a.id === data.target)?.lodging}
            onJump={jumpTo}
            onClear={() => setPicked(null)}
            onOff={toggleBld}
          />
        ) : (
          <SggPanel
            data={data}
            sgg={sgg}
            meta={meta}
            nat={nat}
            active={hover ?? pinned}
            onHover={setHover}
            onPin={(cd) => setPinned((p) => (p === cd ? null : cd))}
            onBack={() => goScene('korea')}
            onToast={onToast}
            boundaryError={boundary === 'error'}
          />
        )}
      </div>
      <button
        type="button"
        className="stage-more"
        onClick={() => {
          const go = (n: number) => {
            const el = document.getElementById('summary-below')
            if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
            else if (n > 0) setTimeout(() => go(n - 1), 150)
          }
          go(20)
        }}
      >
        현황 요약 ↓
      </button>
    </section>
  )
}

/** V-World 배경. 전국 보기의 위성에는 하이브리드(지명·도로 라벨)를 겹친다. 건물을 볼 때(줌 13+)는 길 이름을 찾도록 옅게 겹친다.
 *  청주 권역(줌 9)에서는 하이브리드 글자가 커져 단계구분도를 가리므로 빼고 시군구 라벨만 쓴다. */
function Tiles({ basemap, labels, faint, onFail }: { basemap: Basemap; labels: boolean; faint: boolean; onFail: (b: Basemap) => void }) {
  const count = useRef({ ok: 0, err: 0 })
  // 라벨(하이브리드)은 위성 타일이 먼저 보이고 나서 받는다(첫 화면 표시를 앞당김)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    count.current = { ok: 0, err: 0 }
  }, [basemap])
  if (basemap === 'none') return null
  const handlers = {
    load: () => {
      loadFonts()
      if (!ready) setTimeout(() => setReady(true), 1200)
    },
    tileload: () => {
      count.current.ok += 1
    },
    tileerror: () => {
      count.current.err += 1
      if (count.current.ok === 0 && count.current.err >= 2) onFail(basemap)
    },
  }
  // keepBuffer 1: 화면 밖 여분 타일을 한 줄만. updateWhenZooming false: 날아가는 중간 줌 타일은 받지 않는다
  // 타일 최대 줌은 17까지 열어 두고, 실제 한도는 지도 최대 줌(ZoomLimit: 기본 12, 건물 켠 때 17)이 정한다
  const common = { attribution: '국토교통부 브이월드', maxZoom: MAX_ZOOM_BUILDINGS, maxNativeZoom: MAX_ZOOM_BUILDINGS, keepBuffer: 1, updateWhenZooming: false }
  return basemap === 'satellite' ? (
    <>
      <TileLayer key="sat" url={vw('Satellite', 'jpeg')} {...common} eventHandlers={handlers} />
      {labels && ready && <TileLayer key="hyb" url={vw('Hybrid', 'png')} {...common} opacity={faint ? 0.5 : 1} />}
    </>
  ) : (
    <TileLayer key="gray" url={vw('midnight', 'png')} {...common} eventHandlers={handlers} />
  )
}

/** 첫 화면: 패널을 뺀 영역에 남한 전체(줌 ≤ 7)를 애니메이션 없이 맞춘다. 패널 크기는 CSS와 같은 규칙으로 계산. */
function InitialView({ onDone }: { onDone: () => void }) {
  const map = useMap()
  useEffect(() => {
    const { x: w } = map.getSize()
    // 모바일은 패널이 지도 아래에 따로 있어 가리는 곳이 없다. 데스크톱은 왼쪽 패널 폭만큼 비운다
    const mobile = window.innerWidth <= 760
    const pad = mobile
      ? { paddingTopLeft: [12, 12] as L.PointTuple, paddingBottomRight: [12, 12] as L.PointTuple }
      : { paddingTopLeft: [Math.min(640, w - 32) + 32, 24] as L.PointTuple, paddingBottomRight: [24, 24] as L.PointTuple }
    map.fitBounds(KOREA, { ...pad, maxZoom: 7, animate: false })
    // 개발 서버에서만: 브라우저 점검용(운영 빌드에서는 빠진다)
    if (import.meta.env.DEV) (window as unknown as { __map?: L.Map }).__map = map
    onDone()
    // 첫 배치는 마운트 때 한 번만(map·onDone 변화로 다시 맞추지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** 패널이 가린 부분을 빼고 보이는 영역 가운데로 옮긴다(데스크톱 왼쪽·오른쪽 패널, 모바일 하단 시트). */
function padding(map: L.Map, panel: HTMLElement | null): { tl: L.PointTuple; br: L.PointTuple } {
  const m = map.getContainer().getBoundingClientRect()
  const p = panel?.getBoundingClientRect()
  if (!p || !p.width) return { tl: [24, 24], br: [24, 24] }
  // 패널이 지도 밖(모바일에서 지도 아래)이면 가리는 곳이 없다
  if (p.top >= m.bottom - 1 || p.bottom <= m.top + 1) return { tl: [16, 16], br: [16, 16] }
  const sheet = p.width > m.width * 0.8
  if (sheet) return { tl: [16, 16], br: [16, Math.max(16, m.bottom - p.top + 12)] }
  if (p.left - m.left < m.width / 2) return { tl: [Math.max(24, p.right - m.left + 16), 24], br: [24, 24] }
  return { tl: [24, 24], br: [Math.max(24, m.right - p.left + 16), 24] }
}

function flyVisible(map: L.Map, to: L.LatLngExpression, zoom: number, pad: { tl: L.PointTuple; br: L.PointTuple }) {
  const pt = map.project(to, zoom)
  const shift = L.point((pad.tl[0] - pad.br[0]) / 2, (pad.tl[1] - pad.br[1]) / 2)
  const center = map.unproject(pt.subtract(shift), zoom)
  if (prefersReducedMotion()) map.setView(center, zoom, { animate: false })
  else map.flyTo(center, zoom, { duration: 1.1 })
}

function ZoomWatch({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap()
  useEffect(() => onZoom(map.getZoom()), [map, onZoom])
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

/** 건물 패널의 「가까이 볼 곳」: 그 구역에서 건물이 가장 많이 모인 곳으로 줌 15 */
function Jump({ to, panel }: { to: [number, number]; panel: React.RefObject<HTMLDivElement | null> }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => flyVisible(map, to, 15, padding(map, panel.current)), 30)
    return () => clearTimeout(t)
  }, [map, to, panel])
  return null
}

function View({ scene, selected, data, panel }: { scene: Scene; selected: string | null; data: Indicators; panel: React.RefObject<HTMLDivElement | null> }) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      if (scene === 'korea' && !selected) return
    }
    const run = () => {
      map.invalidateSize()
      const pad = padding(map, panel.current)
      // 좁은 화면(모바일)은 한 단계 덜 확대해 충북 전체·공항 권역이 보이게 한다
      const near = map.getSize().x < 600 ? 8 : 9
      if (scene === 'cheongju') return flyVisible(map, CHEONGJU, near, pad)
      const a = selected ? data.airports.find((x) => x.id === selected) : null
      if (a?.lat != null && a.lng != null) return flyVisible(map, [a.lat, a.lng], near, pad)
      const opts = { paddingTopLeft: pad.tl, paddingBottomRight: pad.br, maxZoom: 7 }
      if (prefersReducedMotion()) map.fitBounds(KOREA, opts)
      else map.flyToBounds(KOREA, { ...opts, duration: 1.1 })
    }
    const t = setTimeout(run, 60)
    return () => clearTimeout(t)
  }, [map, scene, selected, data, panel])
  return null
}

/** 공항 점 4곳: 원 크기 = ② 체류 인·일, 채움 농도 = ① 1인당 카드소비. 청주만 노랑, 참고값은 점선. */
function Airports({ data, nat, month, onSelect, gap }: { data: Indicators; nat: string; month: number | null; onSelect: (id: string) => void; gap: number }) {
  const { target } = data.halves
  const maxPer = Math.max(1, ...data.airports.map((a) => a.nat[nat]?.halves?.[target]?.per_arrival_spend ?? 0))
  return (
    <>
      {data.airports.map((a) => {
        const b = a.nat[nat]
        const h = b?.halves?.[target]
        if (a.lat == null || a.lng == null || !h) return null
        const arr = month != null ? b?.monthly?.arr[month] ?? null : null
        const ratio = month != null ? b?.monthly?.ratio[month] ?? null : h.visit_ratio
        const thin = month != null && (arr == null || arr < data.min_monthly_arrivals)
        const r = ratio != null ? 9 * Math.sqrt(ratio) : 7
        const isT = a.id === data.target
        const ref = b?.status !== '채택'
        const fillOpacity = thin ? 0.12 : 0.15 + 0.7 * ((h.per_arrival_spend ?? 0) / maxPer)
        return (
          <CircleMarker
            key={`${a.id}-${nat}`}
            center={[a.lat, a.lng]}
            radius={r}
            pathOptions={{
              color: isT ? SIGN : '#ffffff',
              weight: isT ? 3 : 1.6,
              dashArray: ref ? '4 4' : undefined,
              fillColor: isT ? SIGN : '#ffffff',
              fillOpacity,
              opacity: thin ? 0.5 : 1,
            }}
            eventHandlers={{ click: () => onSelect(a.id) }}
          >
            <Tooltip key={`tip-${gap}`} permanent direction="right" offset={[r + gap, 0]} className={`ap-tip${isT ? ' t' : ''}`}>
              {iata(a)}
              {ref ? ' · 참고값' : ''}
              {thin ? ' · 표본 적음' : ''}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}

/** 공항 반경 5·10km 원(선만). 전국 보기(줌 ≤ 9)에서만, 누르면 숙박 공급 수. */
function Rings({ data }: { data: Indicators }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  if (zoom > 9 || !data.supply) return null
  const supply = data.supply
  return (
    <>
      {data.airports.flatMap((a) =>
        a.lat == null || a.lng == null || !a.lodging
          ? []
          : supply.radii_km.map((km) => (
              <Circle
                key={`${a.id}-${km}`}
                center={[a.lat!, a.lng!]}
                radius={km * 1000}
                pathOptions={{ color: '#ffffff', weight: 1, opacity: 0.6, dashArray: km === supply.radii_km[supply.radii_km.length - 1] ? '3 5' : undefined, fillOpacity: 0 }}
              >
                <Popup className="dark-pop">
                  <b>
                    {a.name}공항 반경 숙박업소(호텔)
                  </b>
                  <div className="pop-rows">
                    {supply.radii_km.map((k) => (
                      <div key={k}>
                        <span>{k}km</span>
                        <span>
                          {fmt(a.lodging![String(k)]?.total)}곳(호텔 {fmt(a.lodging![String(k)]?.hotel)})
                        </span>
                      </div>
                    ))}
                  </div>
                  <p>{supply.note}</p>
                  <p className="src">{supply.source}</p>
                </Popup>
              </Circle>
            )),
      )}
    </>
  )
}

function SidoHighlight({ sido, region, target }: { sido: SidoBoundary; region?: string; target: boolean }) {
  const f = sido.features.find((x) => x.properties.region === region)
  if (!f) return null
  return (
    <GeoJSON
      key={region}
      data={f as unknown as GeoJSON.Feature}
      interactive={false}
      style={{ color: target ? SIGN : '#ffffff', weight: 2.5, fillColor: target ? SIGN : '#ffffff', fillOpacity: 0.07 }}
    />
  )
}

interface CjProps {
  data: Indicators
  sgg: SggData
  nat: string
  boundary: Boundary
  basemap: Basemap
  active: string | null
  onHover: (cd: string | null) => void
  onPin: (cd: string) => void
  /** 건물 레이어를 켠 때: 단계구분도 채움·방문 원·값 라벨을 빼고 경계선과 이름만 */
  quiet: boolean
}

/** 2장면: 충북 시군구 단계구분도(위성 위 투명도 0.55), 원 = 월평균 방문, 콘텐츠 지점 */
function Cheongju({ data, sgg, nat, boundary, basemap, active, onHover, onPin, quiet }: CjProps) {
  const byCd = useMemo(() => new Map(sgg.items.map((i) => [i.cd, i])), [sgg])
  const geo = useRef<L.GeoJSON>(null)
  const live = useRef({ onHover, onPin, quiet })
  useEffect(() => {
    live.current = { onHover, onPin, quiet }
  })
  const story = mapStory(sgg, nat)
  const cj = data.airports.find((a) => a.id === data.target)
  const style = useMemo(
    () =>
      (f?: GeoJSON.Feature): L.PathOptions => {
        const cd = (f?.properties as BoundaryFeature['properties'] | undefined)?.cd ?? ''
        const v = byCd.get(cd)?.nat[nat]?.per_visit ?? null
        const on = cd === active && !quiet
        if (quiet) return { fillOpacity: 0, color: '#ffffff', weight: 1.2, opacity: 0.7, dashArray: '4 4' }
        return { fillColor: binColor(v, sgg.bins) ?? '#555', fillOpacity: FILL[basemap], color: '#ffffff', weight: on ? 3 : 0.8, opacity: on ? 1 : 0.8, dashArray: undefined }
      },
    [byCd, nat, active, basemap, sgg.bins, quiet],
  )
  useEffect(() => {
    geo.current?.setStyle(style as L.StyleFunction)
  }, [style])

  const label = (cd: string) => {
    if (!story) return null
    const it = byCd.get(cd)!
    const v = it.nat[nat]
    if (cd === story.visitTop.cd) return `${it.name}${cd === sgg.airport_cd ? '(공항)' : ''} 월 ${fmt(v.visit_mavg)}명 · 방문 1회당 ${fmt(v.per_visit)}원`
    if (cd === story.spendTop.cd) return `${it.name} 방문 1회당 ${fmt(v.per_visit)}원`
    return null
  }

  return (
    <>
      <GeoJSON
        ref={geo}
        data={boundary as unknown as GeoJSON.FeatureCollection}
        style={style as L.StyleFunction}
        onEachFeature={(f, layer) => {
          const cd = (f.properties as BoundaryFeature['properties']).cd
          layer.on({
            mouseover: () => !live.current.quiet && live.current.onHover(cd),
            mouseout: () => !live.current.quiet && live.current.onHover(null),
            click: () => !live.current.quiet && live.current.onPin(cd),
          })
        }}
      />
      {!quiet && boundary.features.map((f) => {
        const p = f.properties
        const v = byCd.get(p.cd)?.nat[nat]?.visit_mavg
        if (!v) return null
        const hl = p.cd === sgg.airport_cd
        return (
          <CircleMarker
            key={`c-${p.cd}-${nat}`}
            center={[p.cy, p.cx]}
            radius={Math.sqrt(v) * 0.3}
            interactive={false}
            pathOptions={{ fill: false, color: hl ? SIGN : '#ffffff', weight: hl ? 3 : 1.3, opacity: hl ? 1 : 0.85 }}
          />
        )
      })}
      {boundary.features.map((f) => {
        const p = f.properties
        const text = quiet ? null : label(p.cd)
        if (!text && !LABELED.has(p.cd)) return null
        const hl = p.cd === sgg.airport_cd
        return (
          <Marker
            key={`l-${p.cd}-${nat}-${quiet ? 'q' : 'v'}`}
            position={[p.cy, p.cx]}
            interactive={false}
            keyboard={false}
            icon={L.divIcon({
              className: 'stage-label',
              iconSize: [0, 0],
              html: text
                ? // 공항 구 값은 위에, 다른 값 라벨은 구의 서쪽(왼쪽)에 붙여 청주 4구 이름과 겹치지 않게 한다
                  `<span class="box${hl ? ' hl' : ' w'}"${hl ? ' style="margin-top:-34px"' : ''}>${text}</span>`
                : `<span class="name">${p.name}</span>`,
            })}
          />
        )
      })}
      {cj?.lat != null && cj.lng != null && (
        <CircleMarker center={[cj.lat, cj.lng]} radius={5} pathOptions={{ color: '#111', weight: 1.5, fillColor: SIGN, fillOpacity: 1 }} interactive={false} />
      )}
      {(sgg.pins?.items ?? []).map((pin) => (
        <PinMarker key={pin.name} pin={pin} sgg={sgg} nat={nat} from={cj} source={sgg.pins!.source} />
      ))}
    </>
  )
}

const PIN_ICON = L.divIcon({ className: 'stage-pin', iconSize: [18, 18], iconAnchor: [9, 9], html: '<span></span>' })

function PinMarker({ pin, sgg, nat, from, source }: { pin: ContentPin; sgg: SggData; nat: string; from?: { lat?: number; lng?: number }; source: string }) {
  const it = sgg.items.find((i) => i.cd === pin.cd)
  const v = it?.nat[nat]
  const km = from?.lat != null && from.lng != null ? distanceKm(from.lat, from.lng, pin.lat, pin.lng) : null
  return (
    <Marker position={[pin.lat, pin.lng]} icon={PIN_ICON} title={pin.name} alt={pin.name}>
      <Popup className="dark-pop">
        <b>{pin.name}</b>
        <div className="pop-sub">
          {it?.full}
          {pin.representative ? ' · 대표 지점' : ''} · {pin.place}
        </div>
        <div className="pop-rows">
          {km != null && (
            <div>
              <span>청주공항까지 직선거리</span>
              <span>{km.toFixed(1)}km</span>
            </div>
          )}
          <div>
            <span>{nat}인 월평균 방문(시군구 평균)</span>
            <span>{fmt(v?.visit_mavg)}명</span>
          </div>
          <div>
            <span>방문 1회당 카드소비(시군구 평균)</span>
            <span>{v?.per_visit == null ? '–' : `${fmt(v.per_visit)}원`}</span>
          </div>
          <div>
            <span>카드소비 반기 합(시군구)</span>
            <span>{fmtMil(v?.card)}백만원</span>
          </div>
        </div>
        <p className="src">
          출처: {source}
          {pin.verified_on ? ` · 좌표 확인 ${pin.verified_on}` : ' · 좌표 확인 전'}
        </p>
      </Popup>
    </Marker>
  )
}
