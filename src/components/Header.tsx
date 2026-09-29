import { useState } from 'react'
import { fmtHalf, fmtYm } from '../lib/format'
import { applyTheme, effectiveTheme } from '../lib/theme'
import type { Meta } from '../lib/types'
import { Segmented } from './Segmented'

const LINKS = [
  ['#summary', '요약'],
  ['#trend', '추이'],
  ['#map', '지도'],
  ['#scenario', '분해·시나리오'],
  ['#method', '산식·검증'],
] as const

interface BarProps {
  nat: string
  nats: string[]
  onNat: (n: string) => void
}

/** 상단 고정 막대. 국적 전환(SEG-01)은 어느 섹션에서든 누를 수 있게 여기 둔다. */
export function TopBar({ nat, nats, onNat }: BarProps) {
  const [, force] = useState(0)
  const dark = typeof document !== 'undefined' && effectiveTheme() === 'dark'
  return (
    <div className="bar">
      <div className="bar-in">
        <span className="bar-title">공항 체류전환 모니터</span>
        <nav aria-label="섹션">
          <ul>
            {LINKS.map(([href, label]) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="bar-right">
          <Segmented ui="SEG-01" label="국적 선택" value={nat} onChange={onNat} options={nats.map((n) => ({ value: n, label: n }))} />
          <button
            type="button"
            className="icon-btn"
            aria-label={dark ? '밝은 화면으로' : '어두운 화면으로'}
            onClick={() => {
              applyTheme(dark ? 'light' : 'dark')
              force((x) => x + 1)
            }}
          >
            {dark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/** TXT-01 기준 시점. 메타가 없으면 "기준일 확인 필요"(ST-10). */
export function asofText(meta: Meta | null): string | null {
  const a = meta?.asof
  const arr = fmtYm(a?.arrivals_latest)
  const ext = a?.datalab_extract ?? fmtYm(a?.datalab_latest)
  if (!arr || !ext || !a?.halves?.length) return null
  const rb = a.card_rebase_date
  const rebased = rb && a.card_extracted_on && a.card_extracted_on >= rb
    ? `(카드 ${rb.slice(0, 4)}.${Number(rb.slice(5, 7))} 재소급 반영)`
    : ''
  return `입국 ${arr}까지 · 데이터랩 ${ext} 추출${rebased} · 반기 비교 ${fmtHalf(a.halves[0])} → ${fmtHalf(a.halves[1])}`
}

export function Intro({ meta }: { meta: Meta | null }) {
  const text = asofText(meta)
  return (
    <header className="top">
      <div className="eyebrow">한국관광 데이터랩 공개 데이터 · 월 1회 갱신</div>
      <h1>공항 체류전환 모니터</h1>
      <p className="lede">
        지방공항으로 들어온 외래객이 그 권역에서 며칠을 보내고 얼마를 쓰는지 국적별로 봅니다. 청주·대구·김해 공항을 같은 산식으로
        비교하고, 제주는 기준선으로 둡니다.
      </p>
      <div className={`asof${text ? '' : ' missing'}`} data-ui="TXT-01">
        {text ?? '기준일 확인 필요'}
      </div>
    </header>
  )
}
