interface Props<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ui: string
  small?: boolean
}

/** 세그먼트 버튼(SEG-01~03). aria-pressed로 선택 상태를 알린다. */
export function Segmented<T extends string>({ label, value, options, onChange, ui, small }: Props<T>) {
  return (
    <div className={`seg${small ? ' sm' : ''}`} role="group" aria-label={label} data-ui={ui}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
