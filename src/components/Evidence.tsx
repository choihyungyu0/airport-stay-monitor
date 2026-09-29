import { useState } from 'react'
import { buildCsv, downloadCsv } from '../lib/csv'
import type { Indicators, Meta, Metric, SggData, Validation } from '../lib/types'
import { Segmented } from './Segmented'
import { chartNote, TrendChart } from './TrendChart'

const VALID: Record<Validation['status'], [string, string]> = {
  pass: ['ok', '확인'],
  warn: ['warn', '경고'],
  skip: ['skip', '생략'],
  static: ['skip', '결과값'],
}

/** PNL-02 검증 6종 + 데이터 점검. 시도-시군구 불일치는 접힌 상태에서도 배지로 보인다(ST-09). */
export function Validations({ meta }: { meta: Meta | null }) {
  if (!meta?.report) return <p className="cap">검증 리포트(meta.json)를 불러오지 못했습니다.</p>
  const r = meta.report
  const warns = r.checks.filter((c) => c.status !== 'pass' && c.status !== 'skip')
  const c4 = r.checks.find((c) => c.id === 'C4')
  return (
    <div data-ui="PNL-02">
      <ul className="checks">
        {r.validations.map((v) => (
          <li key={v.id}>
            <span className={`chip ${VALID[v.status][0]}`}>{VALID[v.status][1]}</span>
            <span>
              <b>
                {v.id} {v.title}
              </b>{' '}
              {v.summary}
            </span>
          </li>
        ))}
      </ul>
      <details className="more" style={{ marginTop: 12 }} open={r.consistency.mismatch > 0}>
        <summary>
          데이터 점검 {r.checks.length}항목 · {warns.length ? `확인 필요 ${warns.length}건` : '모두 통과'}
        </summary>
        <ul className="checks">
          {r.checks.map((c) => (
            <li key={c.id}>
              <span className={`chip ${c.status === 'pass' ? 'ok' : c.status === 'skip' ? 'skip' : 'warn'}`}>
                {c.status === 'pass' ? '통과' : c.status === 'skip' ? '생략' : c.status === 'fail' ? '실패' : '경고'}
              </span>
              <span>
                <b>{c.name}</b> {c.detail}
              </span>
            </li>
          ))}
          {c4?.items?.map((i, k) => (
            <li key={`c4-${k}`}>
              <span className={`chip ${i.status === 'ok' ? 'ok' : i.status === 'skip' ? 'skip' : 'warn'}`}>
                {i.status === 'ok' ? '일치' : i.status === 'skip' ? '생략' : '불일치'}
              </span>
              <span>
                {i.sido} {i.period} — {i.detail}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

interface Props {
  data: Indicators
  sgg: SggData
  meta: Meta | null
  nat: string
}

/** UI-09 근거와 검증. 담당자는 닫아 두고, 심사위원이 열어 본다. */
export function Evidence({ data, sgg, meta, nat }: Props) {
  const [metric, setMetric] = useState<Metric>('ratio')
  const mism = meta?.report?.consistency.mismatch ?? 0
  return (
    <details className="evidence" id="method">
      <summary>
        <div>
          <h2>근거와 검증</h2>
          <p>월별 추이 · 산식 · 검증 6종 · 한계 · 출처 · 결과 CSV</p>
        </div>
        {mism > 0 && <span className="badge" role="status">⚠ 시도-시군구 불일치 {mism}건</span>}
        <span className="chev" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="ev-body">
        <div className="ev-block" id="trend">
          <div className="ev-head">
            <h3>월별 추이 · {nat}</h3>
            <Segmented
              ui="SEG-02"
              small
              label="지표 선택"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'ratio', label: '② 체류 인·일' },
                { value: 'card', label: '① 1인당 카드소비' },
                { value: 'arr', label: '입국자 수' },
              ]}
            />
          </div>
          <TrendChart data={data} nat={nat} metric={metric} />
          <p className="cap" style={{ marginTop: 8 }}>{chartNote(metric, nat, data.min_monthly_arrivals)}</p>
        </div>

        <div className="ev-cols">
          <div className="ev-block" data-ui="PNL-01">
            <h3>산식</h3>
            <p className="formula">① 입국 1인당 권역 카드소비 = Σ권역 외국인 카드소비(반기) ÷ Σ공항 입국자(반기)</p>
            <p className="formula">② 체류 인·일 = 권역 월평균 방문자 ÷ 공항 월평균 입국자</p>
            <p className="formula">연동 검정 = 수준·차분 상관 모두 지역공항 &gt; 인천, 차분 상관 ≥ 0.5</p>
            <p className="formula">시나리오 = 입국자 × 늘어난 체류일 × (① ÷ ②)</p>
            <h3 style={{ marginTop: 18 }}>읽는 법과 한계</h3>
            <ul>
              <li>카드는 외국 발행 신용카드 결제분입니다. 현금·여행사 선결제가 빠지므로 1인당 값은 하한입니다(대만 단체여행 40.6%).</li>
              <li>방문자는 일자별 순방문자라 2박 3일 1명이 3명으로 잡힙니다. 그래서 ②는 1인당 체류 인·일에 가깝습니다.</li>
              <li>권역 소비에는 인천 등 다른 공항 입국자도 섞입니다. 연동 검정을 통과한 공항·국적만 정식 값으로 씁니다.</li>
              <li>월별 값은 입국자가 적은 달에 크게 흔들립니다. 판단은 반기 값으로 합니다.</li>
            </ul>
          </div>
          <div className="ev-block">
            <h3>검증 6종</h3>
            <Validations meta={meta} />
          </div>
        </div>

        <div className="ev-block ev-head" style={{ margin: 0 }}>
          <div>
            <h3>출처</h3>
            <p className="cap">
              한국관광 데이터랩 외래객 지역별 방한현황(방문·카드·간편결제) · 관광지식정보시스템 입국관광통계 · 외래관광객조사 2025(결과값만) · 통계청
              SGIS 행정구역 경계. 재현: 원천 CSV 교체 → <code>npm run build:data</code>.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            data-ui="BTN-01"
            onClick={() => downloadCsv(`airport-monitor_${nat}_${data.halves.target}.csv`, buildCsv(data, sgg, meta, nat))}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" />
            </svg>
            결과 CSV 내려받기({nat})
          </button>
        </div>
      </div>
    </details>
  )
}
