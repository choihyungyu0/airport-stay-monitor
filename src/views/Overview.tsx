import { Board } from '../components/Board'
import { Decomposition } from '../components/Decomposition'
import { KpiTiles } from '../components/Kpi'
import { PageHead } from '../components/Shell'
import { TrendPanel } from '../components/TrendPanel'
import { copyText } from '../lib/clipboard'
import { fmtHalf } from '../lib/format'
import { summaryLine } from '../lib/report'
import { decompCaption, decompTitle } from '../lib/story'
import type { Indicators, Meta } from '../lib/types'

interface Props {
  data: Indicators
  meta: Meta | null
  nat: string
  onToast: (m: string) => void
}

/** 현황: 매달 여는 첫 화면. 반기 핵심 지표 → 공항 비교 → 월별 추이 → 변화 요인. */
export function Overview({ data, meta, nat, onToast }: Props) {
  const t = data.airports.find((a) => a.id === data.target)!
  const line = summaryLine(data, nat)
  const d = data.decomposition
  return (
    <>
      <PageHead title="현황" sub={`${t.name}공항 → ${t.region} · ${nat} 입국자 · ${fmtHalf(data.halves.target)}`} meta={meta} />
      {line && (
        <div className="summary">
          <p>{line}</p>
          <button type="button" className="btn sm" onClick={async () => onToast((await copyText(line)) ? '요약 한 줄을 복사했습니다.' : '복사하지 못했습니다.')}>
            한 줄 복사
          </button>
        </div>
      )}
      <KpiTiles data={data} nat={nat} />
      <section className="block" aria-label="공항별 비교">
        <Board data={data} nat={nat} />
        <p className="cap" style={{ marginTop: 10 }}>
          같은 산식으로 네 공항을 비교합니다. ① 권역 외국인 카드소비 ÷ 공항 입국자(반기). ② 권역 월평균 방문 ÷ 공항 월평균 입국. 빈 점(참고값)은
          인천 입국자 혼입을 걸러내지 못한 값입니다.
        </p>
      </section>
      <section className="block">
        <TrendPanel data={data} nat={nat} />
      </section>
      {!d.skipped && (
        <section className="block" aria-labelledby="h-dec">
          <h2 className="block-h" id="h-dec">
            1인당 소비 변화 요인 <span>{decompTitle(d)}</span>
          </h2>
          <p className="cap" style={{ marginBottom: 10 }}>{decompCaption(d)}</p>
          <Decomposition data={data} />
        </section>
      )}
    </>
  )
}
