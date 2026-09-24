import React from 'react'
import { useStore } from '../state/store'
import { Segmented, Toggle } from './ui'

export function SourceTargetPanel(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const guilds = useStore((s) => s.guilds)
  const channels = useStore((s) => s.channels)
  const dms = useStore((s) => s.dms)
  const loading = useStore((s) => s.loadingSources)
  const selectedAccountId = useStore((s) => s.selectedAccountId)

  const setSourceType = useStore((s) => s.setSourceType)
  const selectServer = useStore((s) => s.selectServer)
  const setChannel = useStore((s) => s.setChannel)
  const setDm = useStore((s) => s.setDm)
  const setExportMode = useStore((s) => s.setExportMode)
  const toggleExcluded = useStore((s) => s.toggleExcluded)
  const roles = useStore((s) => s.roles)
  const setRoleFilterEnabled = useStore((s) => s.setRoleFilterEnabled)
  const toggleRole = useStore((s) => s.toggleRole)

  const selectedAccount = useStore((s) => s.accounts.find((a) => a.id === s.selectedAccountId))

  if (!selectedAccountId) {
    return (
      <div className="panel">
        <h2>Source &amp; Target</h2>
        <div className="empty-note">Add and select an account first.</div>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Source &amp; Target</h2>

      <label className="field">Source type</label>
      <Segmented
        options={[
          { value: 'server', label: 'Server' },
          { value: 'dm', label: 'DM' }
        ]}
        value={settings.sourceType}
        onChange={(v) => void setSourceType(v)}
      />

      {settings.sourceType === 'server' ? (
        <>
          <label className="field">Server {loading && <span className="muted">· loading…</span>}</label>
          <select
            value={settings.serverId ?? ''}
            onChange={(e) => void selectServer(e.target.value)}
          >
            <option value="" disabled>
              {guilds.length ? 'Select a server…' : 'No servers available'}
            </option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <label className="field">Export mode</label>
          <Segmented
            options={[
              { value: 'single_channel', label: 'Single' },
              { value: 'full_server', label: 'Full' },
              { value: 'exclude_channels', label: 'Exclude' }
            ]}
            value={settings.exportMode}
            onChange={setExportMode}
          />

          {settings.exportMode === 'single_channel' && (
            <>
              <label className="field">Channel</label>
              <select
                value={settings.channelId ?? ''}
                onChange={(e) => setChannel(e.target.value)}
                disabled={!channels.length}
              >
                <option value="" disabled>
                  {channels.length ? 'Select a channel…' : 'Select a server first'}
                </option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {settings.exportMode === 'exclude_channels' && channels.length > 0 && (
            <>
              <label className="field">Exclude channels ({settings.excludedChannelIds.length})</label>
              <div className="checklist">
                {channels.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={settings.excludedChannelIds.includes(c.id)}
                      onChange={() => toggleExcluded(c.id)}
                    />
                    #{c.name}
                  </label>
                ))}
              </div>
            </>
          )}

          <Toggle
            label="Filter by role"
            description="Only export content from members who currently hold a selected role"
            checked={settings.roleFilterEnabled}
            onChange={setRoleFilterEnabled}
          />
          {settings.roleFilterEnabled && (
            <>
              {selectedAccount && !selectedAccount.isBot && (
                <div className="warn-banner" style={{ marginTop: 6 }}>
                  User tokens may not resolve member roles reliably; unconfirmed authors are kept and
                  a warning is logged.
                </div>
              )}
              {roles.length === 0 ? (
                <div className="empty-note">
                  {settings.serverId ? 'No roles available.' : 'Select a server first.'}
                </div>
              ) : (
                <>
                  <label className="field">
                    Roles ({settings.roleIds.length}) · any-of match
                  </label>
                  <div className="checklist">
                    {roles.map((r) => (
                      <label key={r.id}>
                        <input
                          type="checkbox"
                          checked={settings.roleIds.includes(r.id)}
                          onChange={() => toggleRole(r.id)}
                        />
                        <span
                          className="dot"
                          style={{ background: roleColor(r.color), flex: '0 0 9px' }}
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {selectedAccount?.isBot && (
            <div className="warn-banner" style={{ marginTop: 12 }}>
              Bot tokens cannot list user DMs. Use a user token to back up DMs.
            </div>
          )}
          <label className="field">Conversation {loading && <span className="muted">· loading…</span>}</label>
          <select value={settings.dmId ?? ''} onChange={(e) => setDm(e.target.value)}>
            <option value="" disabled>
              {dms.length ? 'Select a conversation…' : 'No DMs available'}
            </option>
            {dms.map((d) => (
              <option key={d.id} value={d.id}>
                {d.type === 3 ? '👥 ' : '@ '}
                {d.name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}

/** Discord integer role color -> CSS hex; 0 (no color) falls back to muted. */
function roleColor(color: number): string {
  if (!color) return 'var(--muted)'
  return `#${color.toString(16).padStart(6, '0')}`
}
