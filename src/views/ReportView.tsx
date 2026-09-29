import { CopyBox } from '../components/CopyBox'
import { Segmented } from '../components/Segmented'
import { PageHead } from '../components/Shell'
import { buildCsv, downloadCsv } from '../lib/csv'
import { effectDoc, halfDoc, monthlyDoc, renderText } from '../lib/report'
import { computeScenario, type ScenarioInput } from '../lib/scenario'
import type { Indicators, Meta, SggData } from '../lib/types'

export type ReportKind = 'monthly' | 'half' | 'effect'

interface Props {
  data: Indicators
  sgg: SggData
  meta: Meta | null
  nat: string
  kind: ReportKind
  onKind: (k: ReportKind) => void
  scenario: ScenarioInput
  onToast: (m: string) => void
}

/** 보고 문안: 월간 업무보고·협의체 자료·사업 근거를 개조식으로 만든다. */
export function ReportView({ data, sgg, meta, nat, kind, onKind, scenario, onToast }: Props) {
  const actual = data.airports.find((a) => a.id === data.target)?.nat[nat]?.halves?.[data.halves.target]?.arrivals ?? 0
  const r = computeScenario(data, nat, scenario.days, scenario.compare, scenario.arrivals)
  const doc =
    kind === 'monthly'
      ? monthlyDoc(data, meta)
      : kind === 'half'
        ? halfDoc(data, sgg, meta, nat, computeScenario(data, nat, data.scenario.default_days, data.scenario.default_compare))
        : r
          ? effectDoc(data, meta, nat, r, scenario.compare, scenario.arrivals != null && scenario.arrivals !== actual, scenario.budget)
          : null
  const text = doc ? renderText(doc) : `${nat} 자료가 없어 효과를 계산하지 못했습니다.`
  const names: Record<ReportKind, string> = { monthly: '월간동향', half: `반기분석_${nat}`, effect: `체류효과_${nat}` }
  const labels: Record<ReportKind, string> = { monthly: '월간 동향', half: `반기 분석 · ${nat}`, effect: `사업 효과 근거 · ${nat}` }
  return (
    <>
      <PageHead title="보고 문안" sub="한글 파일(.hwpx)로 저장하거나 복사해 붙여 넣는 개조식 · 숫자는 화면 값과 같습니다" meta={meta}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const name = `airport-monitor_${nat}_${data.halves.target}.csv`
            downloadCsv(name, buildCsv(data, sgg, meta, nat))
            onToast(`${name}을 저장했습니다.`)
          }}
        >
          지표 표 CSV
        </button>
      </PageHead>
      <div className="report-tabs">
        <Segmented
          ui="SEG-05"
          label="문안 종류"
          value={kind}
          onChange={onKind}
          options={[
            { value: 'monthly', label: '월간 동향' },
            { value: 'half', label: `반기 분석 · ${nat}` },
            { value: 'effect', label: '사업 효과 근거' },
          ]}
        />
        <p className="cap">
          {kind === 'monthly' && '최근 달과 반기 누계를 대만·일본 모두 적습니다. 월간 업무보고용.'}
          {kind === 'half' && '공항 비교·권역 내 분포·변화 요인까지 담습니다. 협의체 회의·분석 보고용.'}
          {kind === 'effect' && '「효과 계산」 탭에서 넣은 조건으로 만듭니다. 예산 요구서·사업계획서용.'}
        </p>
      </div>
      <CopyBox label={labels[kind]} text={text} doc={doc} filename={`공항체류전환_${names[kind]}_${data.halves.target}`} onToast={onToast} />
    </>
  )
}
