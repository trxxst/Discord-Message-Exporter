import React from 'react'
import { useStore } from '../state/store'
import { THEMES, applyTheme } from '../theme/themes'

export function TopBar(props: {
  theme: string
  onTheme: (id: string) => void
}): React.JSX.Element {
  const accounts = useStore((s) => s.accounts)
  const selectedId = useStore((s) => s.selectedAccountId)
  const selected = accounts.find((a) => a.id === selectedId)

  const status = selected?.status ?? (selected ? 'connected' : 'disconnected')
  const statusLabel = !selected
    ? 'No account'
    : status === 'connected'
      ? `Connected · ${selected.label || selected.username}`
      : status === 'invalid'
        ? 'Auth invalid'
        : 'Disconnected'

  return (
    <div className="topbar">
      <div className="logo">DB</div>
      <div className="app-name">Discord Backup</div>
      <div className="spacer" />
      <div className="status-pill">
        <span className={`dot ${status}`} />
        {statusLabel}
      </div>
      <div className="theme-row">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-swatch ${props.theme === t.id ? 'active' : ''}`}
            style={{ background: t.swatch }}
            title={t.label}
            onClick={() => {
              applyTheme(t.id)
              props.onTheme(t.id)
            }}
          />
        ))}
      </div>
    </div>
  )
}
