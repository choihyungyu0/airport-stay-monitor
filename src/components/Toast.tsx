import { useEffect } from 'react'

/** 짧은 안내(ST-08 등). 4.5초 뒤 사라진다. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 4500)
    return () => clearTimeout(t)
  }, [message, onDone])
  return (
    <div role="status" aria-live="polite">
      {message && <div className="toast">{message}</div>}
    </div>
  )
}
