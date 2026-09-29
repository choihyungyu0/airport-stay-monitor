import { useEffect, useRef, useState } from 'react'

/**
 * 출발 안내판처럼 숫자 한 자씩 넘어가는 표기.
 * 값이 바뀔 때만 한 번 넘어가고 끝나면 멈춘다(첫 표시·같은 값 다시 그리기에는 움직이지 않음).
 * prefers-reduced-motion이면 CSS에서 애니메이션을 끈다.
 */
export function Flap({ text }: { text: string }) {
  const prev = useRef(text)
  const [go, setGo] = useState(false)
  useEffect(() => {
    if (prev.current === text) return
    prev.current = text
    setGo(true)
  }, [text])
  const chars = [...text]
  const last = chars.reduce((k, ch, i) => (/\d/.test(ch) ? i : k), -1)
  return (
    <span className={`flap${go ? ' go' : ''}`}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <span
            key={`${i}-${go ? text : ''}`}
            className="tile"
            style={go ? { animationDelay: `${i * 40}ms` } : undefined}
            aria-hidden="true"
            onAnimationEnd={i === last ? () => setGo(false) : undefined}
          >
            {ch}
          </span>
        ) : (
          <span key={i} className="sep" aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  )
}
