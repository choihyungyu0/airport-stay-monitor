import { useEffect, useState } from 'react'
import { buildCsv, downloadCsv } from '../lib/csv'
import { fmt, fmtHalf, fmtYm } from '../lib/format'
import { RAMP } from '../lib/ramp'
import { dividerIndex } from '../lib/series'
import { compareLine, headline, mapStory } from '../lib/story'
import { useTitleFont } from '../lib/titleFont'
import type { Indicators, Meta, SggData } from '../lib/types'
import { Board } from './Board'
import { SggTable } from './SggTable'
import { asofText } from './Shell'

interface FidsProps {
  data: Indicators
  meta: Meta | null
  nat: string
  selected: string | null
  onSelect: (id: string) => void
  month: number | null
  onMonth: (m: number | null) => void
  onScene: () => void
}

/** 1장면 패널: 출발 안내판(공항 4곳) + 비교 한 줄 + 월별 재생 */
export function FidsPanel({ data, meta, nat, selected, onSelect, month, onMonth, onScene }: FidsProps) {
  const h = headline(data, nat)
  const line = compareLine(data, nat)
  useTitleFont(h ? `${h.line1} ${h.line2}` : null)
  return (
    <div className="fids">
      <p className="fids-label">{h?.label ?? '청주공항 → 충북'}</p>
      {h && (
        <h1 className="fids-title">
          {h.line1} {h.line2}
        </h1>
      )}
      <Board data={data} nat={nat} selected={selected} onSelect={onSelect} />
      {line && <p className="fids-line">{line}</p>}
      <p className="fids-key">원 크기 = ② 체류 인·일 · 채움 농도 = ① 1인당 카드소비 · 점선 = 참고값(연동 검정 미통과)</p>
      <Timeline data={data} month={month} onMonth={onMonth} />
      <div className="fids-foot">
        <button type="button" className="go" onClick={onScene}>
          청주 권역 보기 →
        </button>
        <span className="asof" data-ui="TXT-01">
          {asofText(meta) ?? '기준일 확인 필요'}
        </span>
      </div>
    </div>
  )
}

/** 월별 재생: 원 크기를 월별 ②로 바꾼다. 사용자가 누를 때만 재생(자동 재생 없음). */
function Timeline({ data, month, onMonth }: { data: Indicators; month: number | null; onMonth: (m: number | null) => void }) {
  const [playing, setPlaying] = useState(false)
  const n = data.months.length
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      onMonth(month == null || month >= n - 1 ? 0 : month + 1)
    }, 650)
    return () => clearInterval(t)
  }, [playing, month, n, onMonth])
  useEffect(() => {
    if (playing && month === n - 1) setPlaying(false)
  }, [playing, month, n])
  const div = dividerIndex(data.months, data.definition_change)
  const cur = month ?? n - 1
  return (
    <div className="timeline" role="group" aria-label="월별 재생">
      <button
        type="button"
        className="tl-play"
        aria-pressed={playing}
        onClick={() => {
          if (!playing && (month == null || month >= n - 1)) onMonth(0)
          setPlaying((p) => !p)
        }}
      >
        {playing ? '■ 멈춤' : '▶ 월별 재생'}
      </button>
      <div className="tl-track">
        <input
          type="range"
          min={0}
          max={n - 1}
          value={cur}
          aria-label="원 크기에 쓸 달"
          aria-valuetext={month == null ? '반기 값' : fmtYm(data.months[cur]) ?? ''}
          onChange={(e) => {
            setPlaying(false)
            onMonth(Number(e.target.value))
          }}
        />
        {div != null && (
          <span className="tl-tick" style={{ left: `${(div / (n - 1)) * 100}%` }} title={`외국인 정의 변경 ${data.definition_change}`} aria-hidden="true" />
        )}
        <div className="tl-ends" aria-hidden="true">
          <span>{fmtYm(data.months[0])}</span>
          <span>외국인 정의 변경 {data.definition_change.slice(2).replace(/-/g, '.')}</span>
          <span>{fmtYm(data.months[n - 1])}</span>
        </div>
      </div>
      <span className="tl-now" aria-live="polite">
        {month == null ? `원: ${fmtHalf(data.halves.target)}` : `원: ${fmtYm(data.months[month])}`}
      </span>
      {month != null && (
        <button
          type="button"
          className="tl-reset"
          onClick={() => {
            setPlaying(false)
            onMonth(null)
          }}
        >
          반기 값으로
        </button>
      )}
    </div>
  )
}

interface SggProps {
  data: Indicators
  sgg: SggData
  meta: Meta | null
  nat: string
  active: string | null
  onHover: (cd: string | null) => void
  onPin: (cd: string) => void
  onBack: () => void
  onToast: (m: string) => void
  boundaryError: boolean
}

/** 2장면 패널: 청주 권역 값 한 줄 + 공항 반경 숙박 + 시군구 표(지도와 연동) */
export function SggPanel({ data, sgg, meta, nat, active, onHover, onPin, onBack, onToast, boundaryError }: SggProps) {
  const story = mapStory(sgg, nat)
  const t = data.airports.find((a) => a.id === data.target)
  const lod = t?.lodging
  const bins = sgg.bins
  const won = (n: number) => (n >= 10000 ? `${n / 10000}만` : `${n / 1000}천`)
  const labels = [`${won(bins[0])}원 미만`, ...bins.slice(1).map((b, i) => `${won(bins[i])}~${won(b)}`), `${won(bins[bins.length - 1])}원 이상`]
  return (
    <div className="sggp">
      <div className="sggp-top">
        <button type="button" className="back" onClick={onBack}>
          ← 전국 보기
        </button>
        <button
          type="button"
          className="back"
          data-ui="BTN-01"
          onClick={() => {
            const name = `airport-monitor_${nat}_${data.halves.target}.csv`
            downloadCsv(name, buildCsv(data, sgg, meta, nat))
            onToast(`${name}을 저장했습니다.`)
          }}
        >
          CSV
        </button>
      </div>
      <p className="fids-label">
        청주 권역 · {sgg.sido} {sgg.items.length}개 시군구 · {nat} · {fmtHalf(sgg.period)}
      </p>
      {story && <h2 className="sggp-title">{story.title}</h2>}
      {lod && (
        <p className="sggp-line">
          청주공항 반경 5km 숙박업소 {fmt(lod['5']?.total)}곳(호텔 {fmt(lod['5']?.hotel)}) · 10km {fmt(lod['10']?.total)}곳(호텔 {fmt(lod['10']?.hotel)})
        </p>
      )}
      {boundaryError && <p className="sggp-line">시군구 경계를 불러오지 못해 지도 색칠 없이 표만 보입니다.</p>}
      <SggTable sgg={sgg} nat={nat} active={active} onHover={onHover} onPin={onPin} />
      <div className="legend" data-ui="LGD-02">
        <span>방문 1회당</span>
        {labels.map((l, i) => (
          <span key={l}>
            <i className="sw" style={{ background: RAMP[i] }} />
            {l}
          </span>
        ))}
        <span>
          <i className="ring" /> 월평균 방문
        </span>
        <span>
          <i className="pin" /> 대만 타깃 콘텐츠
        </span>
      </div>
    </div>
  )
}
