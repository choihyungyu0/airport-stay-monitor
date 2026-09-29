import { useEffect, useState } from 'react'

// Leaflet은 SVG 속성에 색을 직접 쓰므로 CSS 변수를 실제 색으로 풀어 줘야 한다.
// 시스템 테마나 data-theme이 바뀌면 다시 읽는다.

const KNOWN = new Set(['accent', 'daegu', 'gimhae', 'jeju'])
const EXTRA = ['ap5', 'ap6', 'ap7']

/** 공항 설정의 color 이름 → CSS 변수. 모르는 이름은 보조 팔레트를 돈다(UI-12). */
export function airportVar(color: string, index: number): string {
  return `--${KNOWN.has(color) ? color : EXTRA[index % EXTRA.length]}`
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 테마가 바뀔 때마다 올라가는 번호. 색을 쓰는 컴포넌트의 key·deps로 쓴다. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const bump = () => setV((x) => x + 1)
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    mq?.addEventListener('change', bump)
    const mo = new MutationObserver(bump)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq?.removeEventListener('change', bump)
      mo.disconnect()
    }
  }, [])
  return v
}

const KEY = 'asm-theme'

export function readSavedTheme(): 'light' | 'dark' | null {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

export function applyTheme(t: 'light' | 'dark' | null): void {
  if (t) document.documentElement.setAttribute('data-theme', t)
  else document.documentElement.removeAttribute('data-theme')
  try {
    if (t) localStorage.setItem(KEY, t)
    else localStorage.removeItem(KEY)
  } catch {
    /* 저장 불가(사생활 보호 모드 등)면 이번 방문에만 적용 */
  }
}

export function effectiveTheme(): 'light' | 'dark' {
  const t = document.documentElement.getAttribute('data-theme')
  if (t === 'light' || t === 'dark') return t
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
