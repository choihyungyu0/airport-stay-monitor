// 숫자·기간 표기. 원 단위 정수는 천 단위 쉼표, 억 원은 소수 1자리.

export const fmt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '–' : Math.round(n).toLocaleString('ko-KR')

export const fmtRatio = (n: number | null | undefined, digits = 2): string =>
  n == null ? '–' : n.toFixed(digits)

/** 부호 붙은 정수(−는 유니코드 마이너스) */
export const signed = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n))

export const signedPct = (n: number, digits = 0): string =>
  (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(digits) + '%'

/** 199,820,183 → "2.0억" */
export const fmtEok = (won: number): string => `${(won / 1e8).toFixed(1)}억`

/** 99,418,707 → "99.4" (백만원) */
export const fmtMil = (won: number | null | undefined): string => (won == null ? '–' : (won / 1e6).toFixed(1))

/** "202607" → "2026.07" */
export const fmtYm = (ym: string | null | undefined): string | null =>
  ym && /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : null

/** "2026H1" → "2026 상반기" */
export const fmtHalf = (h: string): string => `${h.slice(0, 4)} ${h.endsWith('1') ? '상' : '하'}반기`

/** 입국 증감률(%) */
export const growthPct = (now: number, before: number): number | null =>
  before ? (now / before - 1) * 100 : null
