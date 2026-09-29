import { fmt, fmtHalf, signed } from '../lib/format'
import type { Indicators } from '../lib/types'

/** UI-07 Kitagawa 요인분해(TBL-02). 절댓값이 가장 큰 국적 변화효과를 강조한다. */
export function Decomposition({ data, nat }: { data: Indicators; nat: string }) {
  const d = data.decomposition
  const target = data.airports.find((a) => a.id === data.target)
  if (d.skipped) {
    return (
      <div className="panel" data-ui="TBL-02">
        <h3>1인당 카드소비 변화 분해</h3>
        <p className="note">{d.reason}</p>
      </div>
    )
  }
  const lead = d.nats.reduce((a, b) => (Math.abs(d.rate[b]) > Math.abs(d.rate[a]) ? b : a), d.nats[0])
  const pctText = `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : ''}${Math.abs(d.pct).toFixed(1)}%`
  return (
    <div className="panel tblwrap">
      <h3>
        {target?.name ?? ''} 1인당 카드소비는 왜 {d.total < 0 ? '줄었나' : '늘었나'}
      </h3>
      <p className="note">
        {d.nats.join('·')}(연동 검정 통과) 가중 1인당 카드소비 변화를 국적 구성 변화와 국적별 1인당 변화로 나눕니다(Kitagawa).
      </p>
      <table data-ui="TBL-02">
        <thead>
          <tr>
            <th scope="col">구분</th>
            <th scope="col">{fmtHalf(d.base)}</th>
            <th scope="col">{fmtHalf(d.target)}</th>
            <th scope="col">효과</th>
          </tr>
        </thead>
        <tbody>
          <tr className="strong">
            <td>가중 1인당 카드소비</td>
            <td className="num">{fmt(d.R0)}원</td>
            <td className="num">{fmt(d.R1)}원</td>
            <td className="num">
              {signed(d.total)}원<span className="subnum">{pctText}</span>
            </td>
          </tr>
          <tr>
            <td>
              구성효과
              <span className="subnum">입국 비중 {d.nats.map((c) => `${c} ${(d.s0[c] * 100).toFixed(1)}→${(d.s1[c] * 100).toFixed(1)}%`).join(' · ')}</span>
            </td>
            <td />
            <td />
            <td className="num">{signed(d.comp)}원</td>
          </tr>
          {d.nats.map((c) => (
            <tr key={c} className={c === nat ? 'focus' : undefined}>
              <td>{c} 1인당 변화효과</td>
              <td className="num">{fmt(d.r0[c])}원</td>
              <td className="num">{fmt(d.r1[c])}원</td>
              <td className="num">{c === lead ? <span className="mark">{signed(d.rate[c])}원</span> : `${signed(d.rate[c])}원`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note" style={{ marginTop: 8 }}>
        검산: 구성효과 + Σ국적별 변화효과 = 가중 1인당 변화(잔차 {Math.abs(d.residual) < 0.5 ? '0' : d.residual.toFixed(2)}).
        분해 값은 참고 구현과 같이 원 미만을 버립니다.
      </p>
    </div>
  )
}
