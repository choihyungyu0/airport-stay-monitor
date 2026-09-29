import { fmt, fmtHalf, fmtMil } from '../lib/format'
import { mapStory, times } from '../lib/story'
import type { SggData } from '../lib/types'

interface Props {
  sgg: SggData
  nat: string
  active: string | null
  onHover: (cd: string | null) => void
}

/** 지도 옆 요약 두 줄 + 접힌 시군구 표(UI-06, TBL-01). */
export function SggFacts({ sgg, nat, active, onHover }: Props) {
  const story = mapStory(sgg, nat)
  const rows = [...sgg.items]
    .filter((s) => s.nat[nat]?.visit_mavg != null)
    .sort((a, b) => (b.nat[nat].visit_mavg ?? 0) - (a.nat[nat].visit_mavg ?? 0))
    .slice(0, sgg.top_n)
  if (!story) return null
  const { visitTop: vt, spendTop: st } = story
  const vtAirport = vt.cd === sgg.airport_cd
  return (
    <div className="facts">
      <div className={`fact${vtAirport ? ' hl' : ''}`} onMouseEnter={() => onHover(vt.cd)} onMouseLeave={() => onHover(null)}>
        <span className="k">방문이 가장 많은 곳 · {vt.full}{vtAirport ? ' (공항)' : ''}</span>
        <span className="v">
          {fmt(vt.nat[nat].visit_mavg)}
          <small>명/월</small>
        </span>
        <span className="s">방문 1회당 {fmt(vt.nat[nat].per_visit)}원</span>
      </div>
      {st.cd !== vt.cd && (
        <div className="fact" onMouseEnter={() => onHover(st.cd)} onMouseLeave={() => onHover(null)}>
          <span className="k">방문 1회당 소비가 가장 큰 곳 · {st.full}</span>
          <span className="v">
            {fmt(st.nat[nat].per_visit)}
            <small>원</small>
          </span>
          <span className="s">{story.ratio ? `${vt.name}의 ${times(story.ratio)}` : ''}</span>
        </div>
      )}
      <details className="more">
        <summary>시군구 {rows.length}곳 표로 보기</summary>
        <div className="tblwrap">
          <table data-ui="TBL-01">
            <caption className="sr-only">
              {nat} 방문 많은 순 상위 {sgg.top_n}곳, {fmtHalf(sgg.period)}
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
        </div>
      </details>
    </div>
  )
}
