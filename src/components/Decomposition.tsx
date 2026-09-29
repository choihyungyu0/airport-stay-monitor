import { fmt, fmtHalf, signed } from '../lib/format'
import { decompRows } from '../lib/story'
import type { Indicators } from '../lib/types'

/** UI-07 Kitagawa 요인분해(TBL-02). 0을 가운데 두고 각 요인이 1인당 소비를 얼마나 밀고 당겼는지 보여 준다. */
export function Decomposition({ data }: { data: Indicators }) {
  const d = data.decomposition
  if (d.skipped) {
    return (
      <div className="bridge" data-ui="TBL-02">
        <p className="cap" style={{ padding: '14px 0' }}>{d.reason}</p>
      </div>
    )
  }
  const rows = decompRows(d)
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), Math.abs(d.total), 1)
  const bar = (v: number) => {
    const w = (Math.abs(v) / max) * 50
    return v < 0 ? { left: `${50 - w}%`, width: `${w}%` } : { left: '50%', width: `${Math.max(w, 0.4)}%` }
  }
  const pct = `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : ''}${Math.abs(d.pct).toFixed(1)}%`
  return (
    <div className="bridge" data-ui="TBL-02" role="table" aria-label="1인당 카드소비 변화 요인분해">
      {rows.map((r) => (
        <div key={r.key} className={`brg${r.lead ? ' lead' : ''}`} role="row">
          <span className="lab" role="rowheader">
            <strong>{r.label}</strong>
            <small>{r.sub}</small>
          </span>
          <span className="track" aria-hidden="true">
            <span className="fill" style={bar(r.value)} />
          </span>
          <span className="val" role="cell">{signed(r.value)}원</span>
        </div>
      ))}
      <div className="brg total" role="row">
        <span className="lab" role="rowheader">
          <strong>가중 1인당 소비 변화</strong>
          <small>
            {fmtHalf(d.base)} {fmt(d.R0)}원 → {fmtHalf(d.target)} {fmt(d.R1)}원 ({pct})
          </small>
        </span>
        <span className="track" aria-hidden="true">
          <span className="fill" style={bar(d.total)} />
        </span>
        <span className="val" role="cell">{signed(d.total)}원</span>
      </div>
    </div>
  )
}
