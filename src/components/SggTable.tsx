import { useState } from 'react'
import { fmt, fmtMil } from '../lib/format'
import { mapStory, times } from '../lib/story'
import type { SggData, SggItem } from '../lib/types'

type SortKey = 'visit_mavg' | 'card' | 'per_visit'

interface TableProps {
  sgg: SggData
  nat: string
  active: string | null
  onHover: (cd: string | null) => void
  onPin: (cd: string | null) => void
}

/** UI-06 시군구 표(TBL-01). 기본은 방문 많은 순, 머리글을 눌러 정렬을 바꾼다. 행에 올리면 지도에 표시. */
export function SggTable({ sgg, nat, active, onHover, onPin }: TableProps) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'visit_mavg', desc: true })
  const val = (s: SggItem, k: SortKey) => s.nat[nat]?.[k] ?? -1
  const rows = [...sgg.items].sort((a, b) => (sort.desc ? val(b, sort.key) - val(a, sort.key) : val(a, sort.key) - val(b, sort.key)))
  const head = (k: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : true }))}>
        {label}
        <span aria-hidden="true">{sort.key === k ? (sort.desc ? '▼' : '▲') : ''}</span>
      </button>
    </th>
  )
  return (
    <div className="panel tblwrap">
      <table data-ui="TBL-01">
        <caption className="sr-only">
          {sgg.sido} 시군구별 {nat} 방문·카드소비. 머리글 버튼으로 정렬합니다.
        </caption>
        <thead>
          <tr>
            <th scope="col">시군구</th>
            {head('visit_mavg', '월평균 방문')}
            {head('card', '카드(백만원)')}
            {head('per_visit', '방문 1회당')}
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
                onClick={() => onPin(s.cd)}
              >
                <td>
                  {s.full}
                  {ap ? ' (공항)' : ''}
                </td>
                <td className="num">{fmt(v?.visit_mavg)}</td>
                <td className="num">{fmtMil(v?.card)}</td>
                <td className="num">{v?.per_visit == null ? '–' : `${fmt(v.per_visit)}원`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 지도 위 요약 두 줄: 방문이 가장 많은 곳, 방문 1회당 소비가 가장 큰 곳 */
export function SggFacts({ sgg, nat }: { sgg: SggData; nat: string }) {
  const story = mapStory(sgg, nat)
  if (!story) return null
  const { visitTop: vt, spendTop: st } = story
  const vtAirport = vt.cd === sgg.airport_cd
  return (
    <div className="facts">
      <div className={`fact${vtAirport ? ' hl' : ''}`}>
        <span className="k">
          방문이 가장 많은 곳 · {vt.full}
          {vtAirport ? ' (공항)' : ''}
        </span>
        <span className="v">
          {fmt(vt.nat[nat].visit_mavg)}
          <small>명/월</small>
        </span>
        <span className="s">방문 1회당 {fmt(vt.nat[nat].per_visit)}원</span>
      </div>
      {st.cd !== vt.cd && (
        <div className="fact">
          <span className="k">방문 1회당 소비가 가장 큰 곳 · {st.full}</span>
          <span className="v">
            {fmt(st.nat[nat].per_visit)}
            <small>원</small>
          </span>
          <span className="s">{story.ratio ? `${vt.name}의 ${times(story.ratio)}` : ''}</span>
        </div>
      )}
    </div>
  )
}
