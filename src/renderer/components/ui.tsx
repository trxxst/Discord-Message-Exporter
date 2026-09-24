import React from 'react'

export function Toggle(props: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div
      className="toggle"
      onClick={() => !props.disabled && props.onChange(!props.checked)}
      style={props.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <div>
        <div className="tl">{props.label}</div>
        {props.description && <div className="td">{props.description}</div>}
      </div>
      <div className={`switch ${props.checked ? 'on' : ''}`} />
    </div>
  )
}

export interface SegOption<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>(props: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="segmented">
      {props.options.map((o) => (
        <button
          key={o.value}
          className={props.value === o.value ? 'active' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
