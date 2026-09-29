import { useEffect } from 'react'
import { fontsAllowed } from './fonts'

// 제목 글꼴 Hahmlet(700)은 전체가 1.4MB라, 화면에 보이는 제목 글자만 Google Fonts text= 로 받아 온다(수십 KB).
// 제목 글자가 바뀌면(국적 전환) 새 묶음을 한 번 더 받는다.

const ID = 'hahmlet-subset'

export function useTitleFont(text: string | null | undefined): void {
  useEffect(() => {
    if (!text || typeof document === 'undefined') return
    let alive = true
    fontsAllowed.then(() => alive && inject(text))
    return () => {
      alive = false
    }
  }, [text])
}

function inject(text: string): void {
  const chars = Array.from(new Set(Array.from(text.replace(/\s/g, '')))).sort().join('')
  const href = `https://fonts.googleapis.com/css2?family=Hahmlet:wght@700&display=swap&text=${encodeURIComponent(chars)}`
  let link = document.getElementById(ID) as HTMLLinkElement | null
  if (link?.href === href) return
  if (!link) {
    link = document.createElement('link')
    link.id = ID
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  link.href = href
}
