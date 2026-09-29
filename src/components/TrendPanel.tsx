import { useState } from 'react'
import type { Indicators, Metric } from '../lib/types'
import { Segmented } from './Segmented'
import { chartNote, TrendChart } from './TrendChart'

/** UI-03 월별 추이 패널(SEG-02 + CHT-01). */
export function TrendPanel({ data, nat }: { data: Indicators; nat: string }) {
  const [metric, setMetric] = useState<Metric>('arr')
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>월별 추이 · {nat}</h2>
        <Segmented
          ui="SEG-02"
          small
          label="지표 선택"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'arr', label: '입국자 수' },
            { value: 'ratio', label: '② 체류 인·일' },
            { value: 'card', label: '① 1인당 카드소비' },
          ]}
        />
      </div>
      <TrendChart data={data} nat={nat} metric={metric} />
      <p className="cap" style={{ marginTop: 8 }}>{chartNote(metric, nat, data.min_monthly_arrivals)}</p>
    </div>
  )
}
