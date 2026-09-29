import { useCallback, useEffect, useState } from 'react'
import { Board, BoardSkeleton } from './components/Board'
import { Decomposition } from './components/Decomposition'
import { Evidence } from './components/Evidence'
import { Hero, TopBar } from './components/Header'
import { Scenario } from './components/Scenario'
import { SggMap } from './components/SggMap'
import { SggFacts } from './components/SggTable'
import { Toast } from './components/Toast'
import { loadBoundary, loadCore, type CoreData } from './lib/data'
import { decompCaption, decompQuestion, decompTitle, mapStory } from './lib/story'
import type { Boundary } from './lib/types'

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; core: CoreData }

// 담당자의 질문 순서대로 읽힌다: 결론 → 공항 비교 → 어디서 새나 → 무엇이 끌어내렸나 → 그래서 얼마 → (근거)
export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [boundary, setBoundary] = useState<Boundary | null | 'error'>(null)
  const [nat, setNat] = useState('대만')
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  // ST-01 → ST-02 / ST-03. 경계는 따로 받아 실패해도 나머지는 남긴다(ST-07).
  useEffect(() => {
    let alive = true
    loadCore()
      .then((core) => {
        if (!alive) return
        setNat(core.indicators.nationalities[0] ?? '대만')
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

  // 해시 앵커(#summary #map #scenario #method)는 내용이 그려진 뒤에 맞춘다.
  useEffect(() => {
    if (load.state !== 'ok' || !location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el instanceof HTMLDetailsElement) el.open = true
    if (el) requestAnimationFrame(() => el.scrollIntoView())
  }, [load.state])

  const core = load.state === 'ok' ? load.core : null
  const data = core?.indicators ?? null
  const story = core ? mapStory(core.sgg, nat) : null

  return (
    <>
      <a className="sr-only skip-link" href="#summary">
        본문 바로가기
      </a>
      <TopBar nat={nat} nats={data?.nationalities ?? ['대만', '일본']} onNat={setNat} />
      <main className="page">
        {load.state === 'error' ? (
          <section className="error" role="alert">
            <h2>자료를 불러오지 못했습니다. 새로고침해 주세요</h2>
            <p className="cap">산출 JSON(public/data)을 읽지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.</p>
            <button type="button" className="btn" onClick={() => location.reload()}>
              새로고침
            </button>
          </section>
        ) : (
          <>
            <Hero data={data} meta={core?.meta ?? null} nat={nat} />
            <section id="summary" aria-label="공항별 비교">
              {data ? <Board data={data} nat={nat} /> : <BoardSkeleton />}
              <p className="cap" style={{ marginTop: 12 }}>
                ① 권역 외국인 카드소비 ÷ 공항 입국자(반기). ② 권역 월평균 방문 ÷ 공항 월평균 입국 — 입국자 1인이 권역에 머문 인·일에
                가깝습니다. 빈 점(참고값)은 인천 입국자 혼입을 걸러내지 못한 값입니다.
              </p>
            </section>
          </>
        )}

        {data && core && (
          <>
            <section className="chapter" id="map" aria-labelledby="h-map">
              <p className="q">어디서 새나</p>
              <h2 className="answer" id="h-map">
                {story?.title ?? `${core.sgg.sido} 시군구별 방문과 소비`}
              </h2>
              <div className="mapgrid">
                <SggMap
                  boundary={boundary}
                  sgg={core.sgg}
                  nat={nat}
                  active={hover ?? pinned}
                  pinned={pinned}
                  onHover={setHover}
                  onPin={setPinned}
                  onToast={setToast}
                />
                <SggFacts sgg={core.sgg} nat={nat} active={hover ?? pinned} onHover={setHover} />
              </div>
            </section>

            <section className="chapter" id="why" aria-labelledby="h-why">
              <p className="q">{decompQuestion(data.decomposition)}</p>
              <h2 className="answer" id="h-why">
                {data.decomposition.skipped ? '1인당 소비 변화 분해' : decompTitle(data.decomposition)}
              </h2>
              {!data.decomposition.skipped && <p className="cap">{decompCaption(data.decomposition)}</p>}
              <Decomposition data={data} />
            </section>

            <div className="chapter">
              <Scenario data={data} nat={nat} />
            </div>

            <Evidence data={data} sgg={core.sgg} meta={core.meta} nat={nat} />
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
