/** 출발 안내판처럼 숫자 한 자씩 넘어가는 표기. 바뀔 때 다시 넘기려면 부모에서 key를 바꾼다. */
export function Flap({ text }: { text: string }) {
  return (
    <span className="flap">
      <span className="sr-only">{text}</span>
      {[...text].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="tile" style={{ animationDelay: `${i * 40}ms` }} aria-hidden="true">
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
