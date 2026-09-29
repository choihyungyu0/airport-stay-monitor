// 방문 1회당 카드소비 단계구분도 색(밝은~짙은 파랑 5단계). 구간 경계는 sgg.json의 bins.
export const RAMP = ['#eef1f6', '#cdd7e8', '#9fb3d6', '#5a7fb8', '#27497f']

export const binColor = (v: number | null, bins: number[]): string | null =>
  v == null ? null : RAMP[bins.filter((b) => v >= b).length]
