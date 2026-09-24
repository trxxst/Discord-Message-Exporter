import React, { useState } from 'react'
import { useStore } from '../state/store'
import { Segmented } from './ui'

export function AccountsPanel(): React.JSX.Element {
  const accounts = useStore((s) => s.accounts)
  const selectedId = useStore((s) => s.selectedAccountId)
  const selectAccount = useStore((s) => s.selectAccount)
  const removeAccount = useStore((s) => s.removeAccount)
  const renameAccount = useStore((s) => s.renameAccount)
  const refreshAccount = useStore((s) => s.refreshAccount)

  const [adding, setAdding] = useState(false)

  return (
    <div className="panel">
      <h2>
        Accounts <span className="pill muted">{accounts.length}</span>
      </h2>

      {accounts.length === 0 && <div className="empty-note">No accounts yet. Add one to begin.</div>}

      {accounts.map((a) => (
        <div
          key={a.id}
          className={`account ${a.id === selectedId ? 'selected' : ''}`}
          onClick={() => selectAccount(a.id)}
        >
          {a.avatarUrl ? (
            <img className="av" src={a.avatarUrl} alt="" />
          ) : (
            <div className="av" />
          )}
          <div className="info">
            <div className="name">{a.label || a.username}</div>
            <div className="sub">
              {a.isBot ? 'BOT' : 'USER'} · {a.id.slice(0, 8)}…
            </div>
          </div>
          <button
            className="icon-btn"
            title="Refresh"
            onClick={(e) => {
              e.stopPropagation()
              void refreshAccount(a.id)
            }}
          >
            ⟳
          </button>
          <button
            className="icon-btn"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation()
              const next = window.prompt('Rename account', a.label || a.username)
              if (next) void renameAccount(a.id, next)
            }}
          >
            ✎
          </button>
          <button
            className="icon-btn"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`Remove ${a.label || a.username}?`)) void removeAccount(a.id)
            }}
          >
            🗑
          </button>
        </div>
      ))}

      <button className="btn block secondary" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
        + Add account
      </button>

      {adding && <AddAccountModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddAccountModal(props: { onClose: () => void }): React.JSX.Element {
  const addAccount = useStore((s) => s.addAccount)
  const [token, setToken] = useState('')
  const [isBot, setIsBot] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await addAccount(token.trim(), isBot)
    setBusy(false)
    if (res.ok) props.onClose()
    else setError(res.error || 'Failed to connect')
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add account</h3>

        <label className="field">Authentication type</label>
        <Segmented
          options={[
            { value: 'bot', label: 'Bot token' },
            { value: 'user', label: 'User token' }
          ]}
          value={isBot ? 'bot' : 'user'}
          onChange={(v) => setIsBot(v === 'bot')}
        />

        {isBot ? (
          <div className="warn-banner" style={{ marginTop: 12 }}>
            Use a bot you own. It can only export servers it has been invited to and cannot read
            other users&apos; DMs.
          </div>
        ) : (
          <div className="warn-banner" style={{ marginTop: 12 }}>
            ⚠️ User (self) tokens violate Discord&apos;s Terms of Service and may get your account
            banned. Use at your own risk; bot tokens are the safe option.
          </div>
        )}

        <label className="field">Token</label>
        <input
          type="password"
          value={token}
          placeholder="Paste token…"
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && token.trim() && submit()}
        />

        {error && (
          <div className="warn-banner" style={{ marginTop: 12, borderColor: 'var(--error)' }}>
            {error}
          </div>
        )}

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={props.onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy || !token.trim()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
