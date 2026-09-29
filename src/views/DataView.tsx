import { PageHead } from '../components/Shell'
import { V2Table, Validations } from '../components/Validations'
import type { Meta } from '../lib/types'

/** 자료·검증(UI-09): 숫자를 믿어도 되는지 확인하는 곳. */
export function DataView({ meta }: { meta: Meta | null }) {
  return (
    <>
      <PageHead title="자료·검증" sub="출처 · 산식 · 검증 · 한계" meta={meta} />
      <div className="cols">
        <section className="panel" aria-labelledby="h-val">
          <h2 id="h-val">검증 6종</h2>
          <Validations meta={meta} />
        </section>
        <section className="panel" aria-labelledby="h-src" data-ui="PNL-01">
          <h2 id="h-src">출처</h2>
          <ul className="plain">
            {(meta?.sources ?? ['한국관광 데이터랩', '관광지식정보시스템 입국관광통계', '통계청 SGIS 행정구역 경계']).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="cap" style={{ marginTop: 8 }}>
            매월 데이터랩 공식 화면·다운로드 CSV로만 갱신합니다(자동 수집 없음). 외래관광객조사 원자료는 개인 신청 자료라 결과값만 씁니다.
          </p>
          <h2 style={{ marginTop: 22 }}>산식</h2>
          <p className="formula">① 입국 1인당 권역 카드소비 = Σ권역 외국인 카드소비(반기) ÷ Σ공항 입국자(반기)</p>
          <p className="formula">② 입국 1인당 체류 인·일 = 권역 월평균 방문자 ÷ 공항 월평균 입국자</p>
          <p className="formula">연동 검정 = 수준·차분 상관 모두 지역공항 &gt; 인천, 차분 상관 ≥ 0.5</p>
          <p className="formula">추가 소비 = 입국자 × 늘어난 체류일 × (① ÷ ②)</p>
        </section>
      </div>
      <div className="cols">
        <section className="panel" aria-labelledby="h-lim">
          <h2 id="h-lim">읽는 법과 한계</h2>
          <ul className="plain">
            <li>카드는 외국 발행 신용카드 결제분입니다. 현금·여행사 선결제가 빠지므로 1인당 값은 하한입니다(대만 단체여행 40.6%).</li>
            <li>방문자는 일자별 순방문자라 2박 3일 1명이 3명으로 잡힙니다. 그래서 ②는 1인당 체류 인·일에 가깝습니다.</li>
            <li>권역 소비에는 인천 등 다른 공항 입국자도 섞입니다. 연동 검정을 통과한 공항·국적만 정식 값으로 씁니다.</li>
            <li>월별 값은 입국자가 적은 달에 크게 흔들립니다(입국 300명 미만 달은 비움). 판단은 반기 값으로 합니다.</li>
          </ul>
        </section>
        <section className="panel" aria-labelledby="h-v2">
          <h2 id="h-v2">연동 검정 전체</h2>
          <p className="cap" style={{ marginBottom: 8 }}>
            지역공항 입국이 인천 입국보다 권역 방문과 더 잘 맞아야 채택합니다. 차분 상관 임계를 0.4·0.6으로 바꿨을 때도 함께 봅니다.
          </p>
          <V2Table meta={meta} />
        </section>
      </div>
    </>
  )
}
