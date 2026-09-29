import type { ReactNode } from 'react'
import { fmtHalf, fmtYm } from '../lib/format'
import type { Meta } from '../lib/types'
import { Segmented } from './Segmented'

export type Tab = 'overview' | 'sgg' | 'effect' | 'report' | 'data'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '현황' },
  { id: 'sgg', label: '시군구' },
  { id: 'effect', label: '효과 계산' },
  { id: 'report', label: '보고 문안' },
  { id: 'data', label: '자료·검증' },
]

// 명세서 화면흐름의 해시 앵커도 그대로 받는다(#summary #trend #map #method).
const LEGACY: Record<string, Tab> = { summary: 'overview', trend: 'overview', map: 'sgg', scenario: 'effect', method: 'data' }

export function tabFromHash(hash: string): Tab {
  const h = hash.replace(/^#/, '')
  if (TABS.some((t) => t.id === h)) return h as Tab
  return LEGACY[h] ?? 'overview'
}

interface BarProps {
  tab: Tab
  nat: string
  nats: string[]
  onNat: (n: string) => void
}

/** 상단 막대: 탭 이동과 국적 전환(SEG-01). 어느 탭에서든 국적을 바꿀 수 있다. */
export function TopBar({ tab, nat, nats, onNat }: BarProps) {
  return (
    <div className="bar">
      <div className="bar-in">
        <a className="brand" href="#overview">
          <b>CJJ</b>
          <span>공항 체류전환 모니터</span>
        </a>
        <nav className="tabs" aria-label="메뉴">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} aria-current={t.id === tab ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="bar-nat">
          <Segmented ui="SEG-01" label="국적 선택" value={nat} onChange={onNat} options={nats.map((n) => ({ value: n, label: n }))} />
        </div>
      </div>
    </div>
  )
}

/** TXT-01 기준 시점. 메타가 없으면 null → "기준일 확인 필요"(ST-10). */
export function asofText(meta: Meta | null): string | null {
  const a = meta?.asof
  const arr = fmtYm(a?.arrivals_latest)
  const ext = a?.datalab_extract ?? fmtYm(a?.datalab_latest)
  if (!arr || !ext || !a?.halves?.length) return null
  const rb = a.card_rebase_date
  const rebased = rb && a.card_extracted_on && a.card_extracted_on >= rb ? `(카드 ${rb.slice(0, 4)}.${Number(rb.slice(5, 7))} 재소급 반영)` : ''
  return `입국 ${arr}까지 · 데이터랩 ${ext} 추출${rebased} · 비교 ${fmtHalf(a.halves[0])} → ${fmtHalf(a.halves[1])}`
}

/** 탭마다 같은 머리: 제목, 대상, 기준 시점, 오른쪽 동작 버튼 */
export function PageHead({ title, sub, meta, children }: { title: string; sub: string; meta: Meta | null; children?: ReactNode }) {
  const asof = asofText(meta)
  return (
    <header className="phead">
      <div>
        <h1>
          {title}
          <span className="phead-sub">{sub}</span>
        </h1>
        <p className={`asof${asof ? '' : ' missing'}`} data-ui="TXT-01">
          {asof ?? '기준일 확인 필요'}
        </p>
      </div>
      {children && <div className="phead-act">{children}</div>}
    </header>
  )
}
