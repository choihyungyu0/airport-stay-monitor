// 글꼴은 첫 화면(위성 타일)이 뜬 뒤에 받는다. 본문 Pretendard 묶음이 타일만큼 무거워서(모바일 3G에서 수백 KB)
// 먼저 받으면 지도가 늦게 보인다. 글꼴은 swap이라 그 사이에는 시스템 글꼴로 보인다.
// 불러오는 때: 위성 타일 첫 로드 · 지도가 아닌 탭 · 3초 뒤(둘 다 안 오면) 중 먼저.

const PRETENDARD = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'

let release: () => void = () => {}
/** 본문 글꼴을 받기 시작하면 풀린다. 제목 글꼴(Hahmlet)도 이 뒤에 받는다. */
export const fontsAllowed = new Promise<void>((r) => {
  release = r
})

let started = false

export function loadFonts(): void {
  if (started || typeof document === 'undefined') return
  started = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = PRETENDARD
  document.head.appendChild(link)
  release()
}
