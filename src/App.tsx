import { useCallback, useEffect, useState } from 'react'
import { BoardSkeleton } from './components/Board'
import { tabFromHash, TopBar, type Tab } from './components/Shell'
import { Toast } from './components/Toast'
import { loadBoundary, loadCore, type CoreData } from './lib/data'
import type { ScenarioInput } from './lib/scenario'
import type { Boundary } from './lib/types'
import { DataView } from './views/DataView'
import { EffectView } from './views/EffectView'
import { Overview } from './views/Overview'
import { ReportView, type ReportKind } from './views/ReportView'
import { SggView } from './views/SggView'

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; core: CoreData }

// 담당자가 매달 쓰는 도구: 현황 확인 → 시군구 고르기 → 효과 계산 → 보고 문안 → (자료·검증)
export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [boundary, setBoundary] = useState<Boundary | null | 'error'>(null)
  const [tab, setTab] = useState<Tab>(() => tabFromHash(typeof location !== 'undefined' ? location.hash : ''))
  const [nat, setNat] = useState('대만')
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [scenario, setScenario] = useState<ScenarioInput>({ days: 0.5, compare: 'pus', arrivals: null, budget: null })
  const [reportKind, setReportKind] = useState<ReportKind>('monthly')
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

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
    loadBoundary()
      .then((b) => alive && setBoundary(b))
      .catch(() => alive && setBoundary('error'))
    return () => {
      alive = false
    }
  }, [])

  // 탭은 주소(#overview …)로 오가서 뒤로 가기·링크 공유가 된다.
  useEffect(() => {
    const on = () => {
      setTab(tabFromHash(location.hash))
      window.scrollTo(0, 0)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  const core = load.state === 'ok' ? load.core : null
  const data = core?.indicators ?? null

  return (
    <>
      <a className="sr-only skip-link" href="#main">
        본문 바로가기
      </a>
      <TopBar tab={tab} nat={nat} nats={data?.nationalities ?? ['대만', '일본']} onNat={setNat} />
      <main className="page" id="main">
        {load.state === 'error' && (
          <section className="error" role="alert">
            <h2>자료를 불러오지 못했습니다. 새로고침해 주세요</h2>
            <p className="cap">산출 JSON(public/data)을 읽지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.</p>
            <button type="button" className="btn" onClick={() => location.reload()}>
              새로고침
            </button>
          </section>
        )}
        {load.state === 'loading' && (
          <div className="loading">
            <div className="skel" style={{ height: 56, maxWidth: 520 }} />
            <BoardSkeleton />
          </div>
        )}
        {data && core && (
          <>
            {tab === 'overview' && <Overview data={data} meta={core.meta} nat={nat} onToast={setToast} />}
            {tab === 'sgg' && (
              <SggView
                data={data}
                sgg={core.sgg}
                meta={core.meta}
                boundary={boundary}
                nat={nat}
                hover={hover}
                pinned={pinned}
                onHover={setHover}
                onPin={setPinned}
                onToast={setToast}
              />
            )}
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
          </>
        )}
        <footer>
          <div>모든 지표는 한국관광 데이터랩 공식 화면·다운로드 자료로만 산출합니다. 데이터를 갱신하면 값이 달라집니다.</div>
          <div>제작 최현규(충북대학교 소프트웨어학부) · 2026 한국관광 데이터랩 활용 경진대회 응모작</div>
        </footer>
      </main>
      <Toast message={toast} onDone={clearToast} />
    </>
  )
}
