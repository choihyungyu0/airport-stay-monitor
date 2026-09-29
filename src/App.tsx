import { useCallback, useEffect, useState } from 'react'
import { AirportCards, CardsSkeleton } from './components/AirportCards'
import { Decomposition } from './components/Decomposition'
import { Intro, TopBar } from './components/Header'
import { MethodPanel } from './components/MethodPanel'
import { ReportPanel } from './components/ReportPanel'
import { Scenario } from './components/Scenario'
import { Segmented } from './components/Segmented'
import { SggMap } from './components/SggMap'
import { SggTable } from './components/SggTable'
import { Toast } from './components/Toast'
import { chartNote, TrendChart } from './components/TrendChart'
import { buildCsv, downloadCsv } from './lib/csv'
import { loadBoundary, loadCore, type CoreData } from './lib/data'
import { fmtHalf } from './lib/format'
import type { Boundary, Metric } from './lib/types'

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; core: CoreData }

export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [boundary, setBoundary] = useState<Boundary | null | 'error'>(null)
  const [nat, setNat] = useState('대만')
  const [metric, setMetric] = useState<Metric>('ratio')
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  // ST-01 → ST-02 / ST-03. 경계는 따로 받아 실패해도 표는 남긴다(ST-07).
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

  // 해시 앵커(#summary #trend #map #method)는 내용이 그려진 뒤에 맞춘다.
  useEffect(() => {
    if (load.state !== 'ok' || !location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView())
  }, [load.state])

  const core = load.state === 'ok' ? load.core : null
  const data = core?.indicators
  const nats = data?.nationalities ?? ['대만', '일본']

  return (
    <>
      <a className="sr-only" href="#summary">
        본문 바로가기
      </a>
      <TopBar nat={nat} nats={nats} onNat={setNat} />
      <div className="wrap">
        <Intro meta={core?.meta ?? null} />

        {load.state === 'error' && (
          <section className="panel error" role="alert">
            <h2>자료를 불러오지 못했습니다. 새로고침해 주세요</h2>
            <p className="note">산출 JSON(public/data)을 읽지 못했습니다. 잠시 뒤 다시 시도하거나 배포 상태를 확인해 주세요.</p>
            <button type="button" className="btn" onClick={() => location.reload()}>
              새로고침
            </button>
          </section>
        )}

        {load.state !== 'error' && (
          <section className="sec" id="summary" aria-labelledby="h-sum">
            <div className="sechead">
              <h2 id="h-sum">{data ? fmtHalf(data.halves.target) : '반기'} 공항별 요약 · {nat}</h2>
            </div>
            {data ? <AirportCards data={data} nat={nat} /> : <CardsSkeleton />}
            <p className="note">
              ① 입국 1인당 권역 카드소비 = 권역 국적별 외국인 카드소비(반기 합) ÷ 해당 공항 국적별 입국자(반기 합). ② 방문 배율 = 권역 월
              방문자 ÷ 공항 월 입국자(월평균). 방문자는 일자별 순방문자라서 2박 3일 1명이 3명으로 잡히므로, ②는 입국자 1인당 권역 체류
              인·일에 가깝습니다. 연동 검정을 통과하지 못한 공항·국적은 참고값입니다.
            </p>
          </section>
        )}

        {load.state === 'loading' && <div className="skeleton" style={{ minHeight: 320 }} aria-hidden="true" />}

        {data && core && (
          <>
            <section className="sec" id="trend" aria-labelledby="h-trend">
              <div className="sechead">
                <h2 id="h-trend">월별 추이</h2>
                <Segmented
                  ui="SEG-02"
                  label="지표 선택"
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: 'ratio', label: '② 방문 배율' },
                    { value: 'card', label: '① 1인당 카드소비' },
                    { value: 'arr', label: '입국자 수' },
                  ]}
                />
              </div>
              <div className="panel">
                <TrendChart data={data} nat={nat} metric={metric} />
                <p className="note" style={{ marginTop: 8 }}>
                  {chartNote(metric, nat, data.min_monthly_arrivals)}
                </p>
              </div>
            </section>

            <section className="sec" id="map" aria-labelledby="h-map">
              <div className="sechead">
                <h2 id="h-map">청주공항 권역 안에서 어디에 쓰는가</h2>
                <span className="asof">
                  {core.sgg.sido} {core.sgg.items.length}개 시군구 · {fmtHalf(core.sgg.period)}
                </span>
              </div>
              <div className="two">
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
                <SggTable sgg={core.sgg} nat={nat} active={hover ?? pinned} onHover={setHover} />
              </div>
            </section>

            <section className="sec" id="scenario" aria-labelledby="h-scen">
              <div className="sechead">
                <h2 id="h-scen">변화의 이유와 체류 시나리오</h2>
              </div>
              <div className="pair">
                <Decomposition data={data} nat={nat} />
                <Scenario data={data} nat={nat} />
              </div>
            </section>

            <section className="sec" id="method" aria-labelledby="h-method">
              <div className="sechead">
                <h2 id="h-method">산식과 검증</h2>
                <button
                  type="button"
                  className="btn"
                  data-ui="BTN-01"
                  onClick={() =>
                    downloadCsv(`airport-monitor_${nat}_${data.halves.target}.csv`, buildCsv(data, core.sgg, core.meta, nat))
                  }
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" />
                  </svg>
                  결과 CSV 내려받기 · {nat}
                </button>
              </div>
              <MethodPanel data={data} meta={core.meta} />
              <ReportPanel meta={core.meta} />
            </section>
          </>
        )}

        <footer>
          <div>
            자료: 한국관광 데이터랩 외래객 지역별 방한현황(국가별 외국인 방문 현황, 외국인 신용카드 국가별 관광소비 현황), 관광지식정보시스템
            입국관광통계, 외래관광객조사 2025 원자료, 통계청 SGIS 행정구역 경계(2025.2Q). 모든 지표는 데이터랩 공식 화면·다운로드 자료로만
            산출합니다.
          </div>
          <div>제작: 최현규(충북대학교 소프트웨어학부) · 2026 한국관광 데이터랩 활용 경진대회 응모작 시제품</div>
        </footer>
      </div>
      <Toast message={toast} onDone={clearToast} />
    </>
  )
}
