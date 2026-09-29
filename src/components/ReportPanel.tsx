import type { CheckStatus, Meta, Validation } from '../lib/types'

const CHECK: Record<CheckStatus, [string, string]> = {
  pass: ['ok', '통과'],
  warn: ['warn', '경고'],
  fail: ['warn', '실패'],
  skip: ['skip', '생략'],
}
const VALID: Record<Validation['status'], [string, string]> = {
  pass: ['ok', '확인'],
  warn: ['warn', '경고'],
  skip: ['skip', '생략'],
  static: ['skip', '결과값'],
}

/** UI-09 검증 6종·데이터 리포트(PNL-02). 시도-시군구 불일치는 경고 배지(ST-09). */
export function ReportPanel({ meta }: { meta: Meta | null }) {
  if (!meta?.report) {
    return (
      <div className="panel" data-ui="PNL-02">
        <p className="note">검증 리포트(meta.json)를 불러오지 못했습니다.</p>
      </div>
    )
  }
  const r = meta.report
  const c4 = r.checks.find((c) => c.id === 'C4')
  const mism = r.consistency.mismatch
  return (
    <div className="panel method" data-ui="PNL-02">
      <div>
        <h3>검증 6종</h3>
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
        <details style={{ marginTop: 12 }}>
          <summary>V2 전체 표 · 차분 상관 임계값 민감도</summary>
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">공항·국적</th>
                  <th scope="col">수준(인천)</th>
                  <th scope="col">차분(인천)</th>
                  {Object.keys(r.v2_table[0]?.sensitivity ?? {}).map((t) => (
                    <th scope="col" key={t}>
                      ≥{t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.v2_table.map((row) => (
                  <tr key={row.airport + row.nat}>
                    <td>
                      {row.airport} {row.nat}
                    </td>
                    <td className="num">
                      {row.lv?.toFixed(2)} ({row.li?.toFixed(2)})
                    </td>
                    <td className="num">
                      {row.dv?.toFixed(2)} ({row.di?.toFixed(2)})
                    </td>
                    {Object.entries(row.sensitivity).map(([t, ok]) => (
                      <td key={t}>{ok ? '채택' : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">중국·베트남 등 미통과 국적은 장기체류자 결제가 섞여 1인당 값을 산출하지 않습니다(BR-I6).</p>
        </details>
      </div>
      <div>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          데이터 리포트
          {mism > 0 && (
            <span className="badge" role="status">
              ⚠ 시도-시군구 불일치 {mism}건
            </span>
          )}
        </h3>
        <ul className="checks" style={{ marginTop: 8 }}>
          {r.checks.map((c) => (
            <li key={c.id}>
              <span className={`chip ${CHECK[c.status][0]}`}>{CHECK[c.status][1]}</span>
              <span>
                <b>{c.name}</b> {c.detail}
              </span>
            </li>
          ))}
        </ul>
        {c4?.items && (
          <details open={mism > 0} style={{ marginTop: 12 }}>
            <summary>시도-시군구 정합성 상세</summary>
            <ul className="checks">
              {c4.items.map((i, k) => (
                <li key={k}>
                  <span className={`chip ${i.status === 'ok' ? 'ok' : i.status === 'skip' ? 'skip' : 'warn'}`}>
                    {i.status === 'ok' ? '일치' : i.status === 'skip' ? '생략' : '불일치'}
                  </span>
                  <span>
                    <b>
                      {i.sido} {i.period}
                    </b>{' '}
                    {i.detail}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
