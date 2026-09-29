import { fmtHalf } from '../lib/format'
import type { Indicators, Meta } from '../lib/types'

/** UI-09 산식·읽는 법·한계·재현·출처(PNL-01). */
export function MethodPanel({ data, meta }: { data: Indicators; meta: Meta | null }) {
  const ind = data.industry
  const last = Object.keys(ind.periods).filter((p) => p.endsWith('H1') || p.endsWith('H2')).sort().pop()
  const mix = last ? Object.entries(ind.periods[last]).sort((a, b) => b[1] - a[1]) : []
  const total = mix.reduce((s, [, v]) => s + v, 0)
  const minArr = data.min_monthly_arrivals
  return (
    <div className="panel method" data-ui="PNL-01">
      <div>
        <h3>산식</h3>
        <div className="formula">
          ① 입국 1인당 권역 카드소비 = Σ권역 국적별 외국인 카드소비(반기) ÷ Σ공항 국적별 입국자(반기)
        </div>
        <div className="formula">② 방문 배율 = 권역 월평균 방문자 ÷ 공항 월평균 입국자 (방문자 합산 금지)</div>
        <div className="formula">V2 채택 = 수준 상관(지역공항) &gt; 수준 상관(인천) 그리고 차분 상관(지역공항) &gt; 차분 상관(인천) 그리고 차분 상관 ≥ 0.5</div>
        <div className="formula">
          분해 comp = Σ(s₁−s₀)(r₀+r₁)/2, rateₖ = (s₀+s₁)/2 × (r₁−r₀), comp + Σrate = R₁ − R₀
        </div>
        <div className="formula">시나리오 = 입국자 × 증가일 × (① ÷ ②)  — 하한 대상 공항, 상한 비교 공항</div>
        <p className="note" style={{ marginTop: 8 }}>
          방문자는 일자별 순방문자라서 2박 3일 1명이 3명으로 잡힙니다. 그래서 ②는 입국자 1인당 권역 체류 인·일에 가깝습니다.
        </p>
        {mix.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <h3>
              {ind.region} 외국인 카드 업종 구성 · {fmtHalf(last!)}
            </h3>
            <div className="bars" style={{ marginTop: 8 }}>
              {mix.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <span className="b" style={{ width: `${(v / mix[0][1]) * 100}%` }} />
                  <span className="v">{((v / total) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <p className="note" style={{ marginTop: 6 }}>
              전체 국적 합계, 구 설치 시 보정 반영. 업종 자료는 반기 단위입니다.
            </p>
          </div>
        )}
      </div>
      <div>
        <h3>읽는 법과 한계</h3>
        <ul>
          <li>
            카드는 외국 발행 신용카드 결제분입니다. 현금과 여행사 선결제는 빠지므로 1인당 값은 하한으로 읽습니다(대만 단체여행 40.6%,
            외래관광객조사 2025).
          </li>
          <li>권역 방문·소비에는 인천 등 다른 공항 입국자도 섞입니다. 그래서 V2를 통과한 국적만 봅니다.</li>
          <li>
            월별 1인당 값은 입국자가 적은 달에 크게 흔들립니다. 판단은 반기 값으로 하고, 월별 선은 방향만 봅니다(월 입국 {minArr}명 미만은
            비움).
          </li>
          <li>방문자 수는 이동통신 추정치입니다. 절대값보다 공항 간 비교와 증감으로 해석합니다.</li>
        </ul>
        <h3 style={{ marginTop: 14 }}>재현 3단계</h3>
        <ol>
          <li>데이터랩 외래객 지역별 방한현황에서 시도·시군구 국가별 방문·카드(월별)를 내려받는다</li>
          <li>관광지식정보시스템 입국관광통계에서 입국항 × 국가 × 월 입국자를 내려받는다</li>
          <li>
            <code>npm run build:data</code>로 산식 적용(참고 구현 <code>compute_indicators.py</code>와 같은 값)
          </li>
        </ol>
        <h3 style={{ marginTop: 14 }}>출처</h3>
        <ul>
          {(meta?.sources ?? ['한국관광 데이터랩', '관광지식정보시스템 입국관광통계', '통계청 SGIS 행정구역 경계']).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
