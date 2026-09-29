import { fmtHalf, fmtYm, growthPct } from './format'
import type { Indicators, Meta, SggData } from './types'

// UI-11 산출 결과 CSV. 엑셀 한글 깨짐 방지를 위해 UTF-8 BOM을 붙인다.

const BOM = '﻿'

export function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)))) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const row = (cells: unknown[]) => cells.map(csvCell).join(',')

export function buildCsv(data: Indicators, sgg: SggData, meta: Meta | null, nat: string): string {
  const { base, target } = data.halves
  const lines: string[] = []
  const asof = meta?.asof
  lines.push(row(['공항 체류전환 모니터 산출 결과', `국적 ${nat}`, `${fmtHalf(target)} (비교 ${fmtHalf(base)})`]))
  lines.push(
    row([
      '기준',
      asof?.arrivals_latest
        ? `입국 ${fmtYm(asof.arrivals_latest)}까지 · 데이터랩 ${asof.datalab_extract ?? fmtYm(asof.datalab_latest)} 추출`
        : '기준일 확인 필요',
    ]),
  )
  lines.push('')
  lines.push(row(['[공항 지표]']))
  lines.push(
    row([
      '공항', '권역', '판정',
      `①입국1인당카드소비_${target}(원)`, `①_${base}(원)`,
      `②방문배율_${target}`, `②_${base}`,
      `입국_${target}(명)`, `입국_${base}(명)`, '입국증감(%)',
      `인일당카드소비_${target}(원)`,
      '수준상관', '수준상관_인천', '차분상관', '차분상관_인천',
    ]),
  )
  for (const a of data.airports) {
    const b = a.nat[nat]
    const h1 = b?.halves?.[target]
    const h0 = b?.halves?.[base]
    const g = h1 && h0 ? growthPct(h1.arrivals, h0.arrivals) : null
    lines.push(
      row([
        `${a.name}공항`, a.region, b?.status ?? '자료 없음',
        h1?.per_arrival_spend, h0?.per_arrival_spend,
        h1?.visit_ratio, h0?.visit_ratio,
        h1?.arrivals, h0?.arrivals, g == null ? null : Math.round(g * 10) / 10,
        h1?.per_day == null ? null : Math.round(h1.per_day),
        b?.v2?.lv, b?.v2?.li, b?.v2?.dv, b?.v2?.di,
      ]),
    )
  }
  lines.push('')
  lines.push(row([`[시군구 지표 ${sgg.sido} ${sgg.period}]`]))
  lines.push(row(['시군구', '행정표준코드', '월평균방문(명)', '카드(원)', '방문1회당카드(원)', '공항소재', '자료']))
  const items = [...sgg.items].sort((x, y) => (y.nat[nat]?.visit_mavg ?? -1) - (x.nat[nat]?.visit_mavg ?? -1))
  for (const s of items) {
    const v = s.nat[nat]
    lines.push(
      row([
        s.full, s.cd, v?.visit_mavg, v?.card, v?.per_visit,
        s.cd === sgg.airport_cd ? 'Y' : '',
        s.source === 'raw' ? '원천 시군구 행' : s.source === 'table' ? '시군구 정리표' : '자료 없음',
      ]),
    )
  }
  return BOM + lines.join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
