import { fmt, fmtHalf, fmtMil } from '../lib/format'
import type { SggData } from '../lib/types'

interface Props {
  sgg: SggData
  nat: string
  active: string | null
  onHover: (cd: string | null) => void
}

/** UI-06 시군구 표(TBL-01). 방문 많은 순 상위 n개, 공항 소재 구는 굵게. */
export function SggTable({ sgg, nat, active, onHover }: Props) {
  const rows = [...sgg.items]
    .filter((s) => s.nat[nat]?.visit_mavg != null)
    .sort((a, b) => (b.nat[nat].visit_mavg ?? 0) - (a.nat[nat].visit_mavg ?? 0))
    .slice(0, sgg.top_n)
  return (
    <div className="panel tblwrap">
      <table data-ui="TBL-01">
        <caption>
          {nat} 방문 많은 순 상위 {sgg.top_n}곳 · {fmtHalf(sgg.period)}
        </caption>
        <thead>
          <tr>
            <th scope="col">시군구</th>
            <th scope="col">월평균 방문</th>
            <th scope="col">카드(백만원)</th>
            <th scope="col">방문 1회당</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const v = s.nat[nat]
            const ap = s.cd === sgg.airport_cd
            return (
              <tr
                key={s.cd}
                className={[ap ? 'airport' : '', s.cd === active ? 'focus' : ''].join(' ').trim() || undefined}
                onMouseEnter={() => onHover(s.cd)}
                onMouseLeave={() => onHover(null)}
              >
                <td>
                  {s.full}
                  {ap ? ' (공항)' : ''}
                </td>
                <td className="num">{fmt(v.visit_mavg)}</td>
                <td className="num">{fmtMil(v.card)}</td>
                <td className="num">{v.per_visit == null ? '–' : `${fmt(v.per_visit)}원`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note" style={{ marginTop: 10 }}>
        공항이 있는 청원구는 방문이 가장 많고 방문 1회당 카드소비는 가장 적습니다. 원 크기는 월평균 방문자, 색은 방문 1회당 카드소비입니다.
        방문 1회당 = 월평균 카드소비 ÷ 월평균 방문(방문자 합산 없음).
      </p>
    </div>
  )
}
