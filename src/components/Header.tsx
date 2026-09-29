import { fmtHalf, fmtYm } from '../lib/format'
import { headline } from '../lib/story'
import type { Indicators, Meta } from '../lib/types'
import { Segmented } from './Segmented'

/** 상단 막대. 국적 전환(SEG-01)은 어느 위치에서든 누를 수 있게 여기 둔다. */
export function TopBar({ nat, nats, onNat }: { nat: string; nats: string[]; onNat: (n: string) => void }) {
  return (
    <div className="bar">
      <div className="bar-in">
        <div className="brand">
          <b>CJJ</b>
          <span>공항 체류전환 모니터</span>
        </div>
        <Segmented ui="SEG-01" label="국적 선택" value={nat} onChange={onNat} options={nats.map((n) => ({ value: n, label: n }))} />
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
  return `입국 ${arr}까지 · 데이터랩 ${ext} 추출${rebased} · ${fmtHalf(a.halves[0])} → ${fmtHalf(a.halves[1])}`
}

/** 첫 화면: 이 페이지가 하는 말 한 문장. */
export function Hero({ data, meta, nat }: { data: Indicators | null; meta: Meta | null; nat: string }) {
  const h = data ? headline(data, nat) : null
  const asof = asofText(meta)
  return (
    <header className="hero">
      {h ? (
        <>
          <p className="hero-label">{h.label}</p>
          <h1>
            <span className="l1">{h.line1}</span>
            <span className="l2">{h.line2}</span>
          </h1>
          <p className="hero-sub">{h.sub}</p>
        </>
      ) : (
        <>
          <p className="hero-label">청주공항 → 충북</p>
          <h1>공항 체류전환 모니터</h1>
          <div className="skel" style={{ height: 52, maxWidth: 640 }} />
        </>
      )}
      <p className={`asof${asof || !data ? '' : ' missing'}`} data-ui="TXT-01">
        {asof ?? (data ? '기준일 확인 필요' : ' ')}
      </p>
    </header>
  )
}
