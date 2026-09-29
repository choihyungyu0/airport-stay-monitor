import { PageHead } from '../components/Shell'
import { SggMap } from '../components/SggMap'
import { SggFacts, SggTable } from '../components/SggTable'
import { buildCsv, downloadCsv } from '../lib/csv'
import { fmtHalf } from '../lib/format'
import { mapStory } from '../lib/story'
import type { Boundary, Indicators, Meta, SggData } from '../lib/types'

interface Props {
  data: Indicators
  sgg: SggData
  meta: Meta | null
  boundary: Boundary | null | 'error'
  nat: string
  hover: string | null
  pinned: string | null
  onHover: (cd: string | null) => void
  onPin: (cd: string | null) => void
  onToast: (m: string) => void
}

/** 시군구: 어디에 사업을 둘지 고르는 화면. 지도와 정렬되는 표가 서로 따라 움직인다. */
export function SggView({ data, sgg, meta, boundary, nat, hover, pinned, onHover, onPin, onToast }: Props) {
  const story = mapStory(sgg, nat)
  return (
    <>
      <PageHead title="시군구" sub={`${sgg.sido} ${sgg.items.length}개 시군구 · ${nat} · ${fmtHalf(sgg.period)}`} meta={meta}>
        <button
          type="button"
          className="btn"
          data-ui="BTN-01"
          onClick={() => {
            const name = `airport-monitor_${nat}_${data.halves.target}.csv`
            downloadCsv(name, buildCsv(data, sgg, meta, nat))
            onToast(`${name}을 저장했습니다.`)
          }}
        >
          CSV 내려받기
        </button>
      </PageHead>
      {story && <p className="lead">{story.title}</p>}
      <SggFacts sgg={sgg} nat={nat} />
      <div className="mapgrid">
        <SggMap
          boundary={boundary}
          sgg={sgg}
          nat={nat}
          active={hover ?? pinned}
          pinned={pinned}
          onHover={onHover}
          onPin={onPin}
          onToast={onToast}
        />
        <SggTable sgg={sgg} nat={nat} active={hover ?? pinned} onHover={onHover} onPin={(cd) => onPin(pinned === cd ? null : cd)} />
      </div>
      <p className="cap" style={{ marginTop: 10 }}>
        방문 1회당 = 월평균 카드소비 ÷ 월평균 방문(방문자 합산 없음). 청주 4구·충주·제천·단양은 데이터랩 시군구 원천 행, 나머지는 데이터랩 화면 시군구
        값 정리표입니다.
      </p>
    </>
  )
}
