import type { Meta, Validation } from '../lib/types'

const VALID: Record<Validation['status'], [string, string]> = {
  pass: ['ok', '확인'],
  warn: ['warn', '경고'],
  skip: ['skip', '생략'],
  static: ['skip', '결과값'],
}

/** PNL-02 검증 6종 + 데이터 점검. 시도-시군구 불일치가 있으면 배지와 함께 펼쳐 둔다(ST-09). */
export function Validations({ meta }: { meta: Meta | null }) {
  if (!meta?.report) return <p className="cap">검증 리포트(meta.json)를 불러오지 못했습니다.</p>
  const r = meta.report
  const warns = r.checks.filter((c) => c.status !== 'pass' && c.status !== 'skip')
  const c4 = r.checks.find((c) => c.id === 'C4')
  const mism = r.consistency.mismatch
  return (
    <div data-ui="PNL-02">
      {mism > 0 && (
        <p className="badge" role="status" style={{ marginBottom: 10 }}>
          ⚠ 시도-시군구 불일치 {mism}건
        </p>
      )}
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
      <details className="more" style={{ marginTop: 12 }} open={mism > 0}>
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

/** 연동 검정 전체 표와 임계값 민감도(IS-04) */
export function V2Table({ meta }: { meta: Meta | null }) {
  const rows = meta?.report?.v2_table ?? []
  if (!rows.length) return null
  const ths = Object.keys(rows[0].sensitivity)
  return (
    <div className="tblwrap">
      <table>
        <thead>
          <tr>
            <th scope="col">공항·국적</th>
            <th scope="col">수준 상관(인천)</th>
            <th scope="col">차분 상관(인천)</th>
            {ths.map((t) => (
              <th scope="col" key={t}>
                임계 {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.airport + r.nat}>
              <td>
                {r.airport} {r.nat}
              </td>
              <td className="num">
                {r.lv?.toFixed(2)} ({r.li?.toFixed(2)})
              </td>
              <td className="num">
                {r.dv?.toFixed(2)} ({r.di?.toFixed(2)})
              </td>
              {ths.map((t) => (
                <td key={t}>{r.sensitivity[t] ? '채택' : '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
