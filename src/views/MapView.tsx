import { Decomposition } from '../components/Decomposition'
import { KpiTiles } from '../components/Kpi'
import { TrendPanel } from '../components/TrendPanel'
import { copyText } from '../lib/clipboard'
import { fmtHalf } from '../lib/format'
import { summaryLine } from '../lib/report'
import { decompCaption, decompTitle } from '../lib/story'
import type { Indicators, Meta } from '../lib/types'
import { Footer } from './Footer'

interface Props {
  data: Indicators
  meta: Meta | null
  nat: string
  onToast: (m: string) => void
}

/** 지도 탭 아래쪽: 반기 핵심 지표·월별 추이·변화 요인. 지도(MapStage)는 App이 자료보다 먼저 띄운다. */
export function MapBelow({ data, nat, onToast }: Props) {
  const t = data.airports.find((a) => a.id === data.target)!
  const line = summaryLine(data, nat)
  const d = data.decomposition
  return (
    <main className="page" id="main">
      <section className="block" id="summary-below" aria-labelledby="h-kpi">
        <div className="block-top">
          <h2 id="h-kpi">
            {t.name}공항 → {t.region} · {nat} 입국자 · {fmtHalf(data.halves.target)}
          </h2>
          {line && (
            <button type="button" className="btn sm ghost" onClick={async () => onToast((await copyText(line)) ? '요약 한 줄을 복사했습니다.' : '복사하지 못했습니다.')}>
              요약 한 줄 복사
            </button>
          )}
        </div>
        {line && <p className="lead">{line}</p>}
        <KpiTiles data={data} nat={nat} />
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
      <Footer />
    </main>
  )
}
