import React from 'react'
import { useStore } from '../state/store'
import { Toggle } from './ui'
import type { ExportPreset } from '../../shared/types'

const PRESET_INFO: { id: ExportPreset; title: string; desc: string }[] = [
  { id: 'full_archive', title: 'Full Archive', desc: 'Everything' },
  { id: 'messages_only', title: 'Messages Only', desc: 'No media' },
  { id: 'media_only', title: 'Media Only', desc: 'Attachments' },
  { id: 'minimal', title: 'Minimal', desc: 'JSON only' }
]

export function DownloadOptionsPanel(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const applyPreset = useStore((s) => s.applyPreset)
  const setToggle = useStore((s) => s.setToggle)
  const pickFolder = useStore((s) => s.pickFolder)
  const startExport = useStore((s) => s.startExport)
  const cancelExport = useStore((s) => s.cancelExport)
  const exporting = useStore((s) => s.exporting)

  const canExport =
    !!settings.accountId &&
    !!settings.outputFolder &&
    (settings.sourceType === 'dm'
      ? !!settings.dmId
      : !!settings.serverId &&
        (settings.exportMode !== 'single_channel' || !!settings.channelId)) &&
    !exporting

  return (
    <div className="panel">
      <h2>Download Options</h2>

      <label className="field">Presets</label>
      <div className="preset-grid">
        {PRESET_INFO.map((p) => (
          <button
            key={p.id}
            className={`preset ${settings.preset === p.id ? 'active' : ''}`}
            onClick={() => applyPreset(p.id)}
          >
            <div className="pt">{p.title}</div>
            <div className="pd">{p.desc}</div>
          </button>
        ))}
      </div>

      <label className="field">Toggles</label>
      <Toggle
        label="Avatars"
        description="Download author avatars"
        checked={settings.includeAvatars}
        onChange={(v) => setToggle('includeAvatars', v)}
      />
      <Toggle
        label="Media & files"
        description="Attachments, embeds, images, video"
        checked={settings.includeMedia}
        onChange={(v) => setToggle('includeMedia', v)}
      />
      <Toggle
        label="Stickers"
        checked={settings.includeStickers}
        onChange={(v) => setToggle('includeStickers', v)}
      />
      <Toggle
        label="Threads"
        description="Export threads under each channel"
        checked={settings.includeThreads}
        onChange={(v) => setToggle('includeThreads', v)}
      />
      <Toggle
        label="Update mode"
        description="Only fetch new messages into an existing backup"
        checked={settings.updateMode}
        onChange={(v) => setToggle('updateMode', v)}
      />
      <Toggle
        label="Create ZIP"
        description="Compress the finished archive"
        checked={settings.createZip}
        onChange={(v) => setToggle('createZip', v)}
      />

      <label className="field">Output folder</label>
      <div className="row">
        <input type="text" readOnly value={settings.outputFolder} placeholder="No folder selected" />
        <button className="btn secondary" onClick={() => void pickFolder()}>
          Browse
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {exporting ? (
          <button className="btn block big danger" onClick={() => void cancelExport()}>
            Cancel export
          </button>
        ) : (
          <button
            className="btn block big"
            disabled={!canExport}
            onClick={() => void startExport()}
          >
            Start Export
          </button>
        )}
      </div>
    </div>
  )
}
