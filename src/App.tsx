import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { canonicalHash, tabFromHash, TopBar, type Tab } from './components/Shell'
import { Toast } from './components/Toast'
import { loadBoundary, loadCore, loadSido, type CoreData } from './lib/data'
import { loadFonts } from './lib/fonts'
import type { ScenarioInput } from './lib/scenario'
import type { Boundary, SidoBoundary } from './lib/types'
import { MapStage } from './components/MapStage'
import { Footer } from './views/Footer'
import { MapBelow } from './views/MapView'
import type { ReportKind } from './views/ReportView'

// 지도 탭이 아닌 화면은 처음 열 때 받는다(첫 화면 JS를 줄임)
const EffectView = lazy(() => import('./views/EffectView').then((m) => ({ default: m.EffectView })))
const ReportView = lazy(() => import('./views/ReportView').then((m) => ({ default: m.ReportView })))
const DataView = lazy(() => import('./views/DataView').then((m) => ({ default: m.DataView })))

/** 첫 화면(위성 타일)을 먼저 그리고, 아래쪽 내용은 브라우저가 한가할 때 그린다 */
function useIdle(enabled: boolean): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!enabled || idle) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setIdle(true), { timeout: 2500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(() => setIdle(true), 800)
    return () => clearTimeout(t)
  }, [enabled, idle])
  return idle
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; core: CoreData }

const initialTab = (): Tab => {
  if (typeof location === 'undefined') return 'map'
  const fixed = canonicalHash(location.hash)
  if (fixed) history.replaceState(null, '', fixed)
  return tabFromHash(location.hash)
}

// 담당자가 매달 쓰는 도구: 지도(위성 · 공항 비교 · 청주 권역) → 효과 계산 → 보고 문안 → (자료·검증)
export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [boundary, setBoundary] = useState<Boundary | null | 'error'>(null)
  const [sido, setSido] = useState<SidoBoundary | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [nat, setNat] = useState('대만')
  const [scenario, setScenario] = useState<ScenarioInput>({ days: 0.5, compare: 'pus', arrivals: null, budget: null })
  const [reportKind, setReportKind] = useState<ReportKind>('monthly')
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const tabRef = useRef(tab)

  // ST-01 → ST-02 / ST-03. 경계는 따로 받아 실패해도 나머지는 남긴다(ST-07).
  useEffect(() => {
    let alive = true
    loadCore()
      .then((core) => {
        if (!alive) return
        const i = core.indicators
        setNat(i.nationalities[0] ?? '대만')
        setScenario((s) => ({ ...s, days: i.scenario.default_days, compare: i.scenario.default_compare }))
        setLoad({ state: 'ok', core })
      })
      .catch(() => alive && setLoad({ state: 'error' }))
    return () => {
      alive = false
    }
  }, [])

  // 경계(시군구 177KB·시도)는 첫 화면에 필요 없어서 핵심 자료·타일이 먼저 받게 뒤로 미룬다(청주 권역 장면·행 클릭에서 씀)
  const coreReady = load.state === 'ok'
  useEffect(() => {
    if (!coreReady) return
    let alive = true
    const t = setTimeout(() => {
      loadBoundary()
        .then((b) => alive && setBoundary(b))
        .catch(() => alive && setBoundary('error'))
      loadSido()
        .then((b) => alive && setSido(b))
        .catch(() => alive && setSido(null))
    }, 1200)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [coreReady])

  // 탭은 주소(#map …)로 오가서 뒤로 가기·링크 공유가 된다. 예전 주소는 새 주소로 바꿔 둔다.
  useEffect(() => {
    const on = () => {
      const fixed = canonicalHash(location.hash)
      if (fixed) history.replaceState(null, '', fixed)
      const next = tabFromHash(location.hash)
      if (next !== tabRef.current) window.scrollTo(0, 0)
      tabRef.current = next
      if (next !== 'map') loadFonts()
      setTab(next)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  const core = load.state === 'ok' ? load.core : null
  const data = core?.indicators ?? null
  const belowReady = useIdle(!!data && tab === 'map')

  return (
    <>
      <a className="sr-only skip-link" href="#main">
        본문 바로가기
      </a>
      <TopBar tab={tab} nat={nat} nats={data?.nationalities ?? ['대만', '일본']} onNat={setNat} />
      {/* 지도 탭은 자료가 오기 전에도 지도·타일을 먼저 띄운다 */}
      {tab === 'map' && load.state !== 'error' && (
        <MapStage data={data} sgg={core?.sgg ?? null} meta={core?.meta ?? null} nat={nat} boundary={boundary} sido={sido} onToast={setToast} />
      )}
      {load.state !== 'ok' && !(tab === 'map' && load.state === 'loading') && (
        <main className="page" id="main">
          {load.state === 'error' ? (
            <section className="error" role="alert">
              <h2>자료를 불러오지 못했습니다. 새로고침해 주세요</h2>
              <p className="cap">산출 JSON(public/data)을 읽지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.</p>
              <button type="button" className="btn" onClick={() => location.reload()}>
                새로고침
              </button>
            </section>
          ) : (
            <div className="loading" aria-busy="true" aria-label="불러오는 중">
              <div className="skel" style={{ height: '60vh' }} />
            </div>
          )}
        </main>
      )}
      {data && core && tab === 'map' && belowReady && <MapBelow data={data} meta={core.meta} nat={nat} onToast={setToast} />}
      {data && core && tab !== 'map' && (
        <main className="page" id="main">
          <Suspense fallback={<div className="loading" aria-busy="true" aria-label="불러오는 중"><div className="skel" style={{ height: 320 }} /></div>}>
          {tab === 'effect' && <EffectView data={data} meta={core.meta} nat={nat} input={scenario} onInput={setScenario} onToast={setToast} />}
          {tab === 'report' && (
            <ReportView
              data={data}
              sgg={core.sgg}
              meta={core.meta}
              nat={nat}
              kind={reportKind}
              onKind={setReportKind}
              scenario={scenario}
              onToast={setToast}
            />
          )}
          {tab === 'data' && <DataView meta={core.meta} />}
          </Suspense>
          <Footer />
        </main>
      )}
      <Toast message={toast} onDone={clearToast} />
    </>
  )
}
