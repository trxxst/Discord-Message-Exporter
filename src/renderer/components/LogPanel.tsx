import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { LogLevel } from '../../shared/types'

const LEVELS: LogLevel[] = ['info', 'warn', 'error', 'success']

export function LogPanel(): React.JSX.Element {
  const logs = useStore((s) => s.logs)
  const clearLogs = useStore((s) => s.clearLogs)
  const progress = useStore((s) => s.progress)

  const [enabled, setEnabled] = useState<Record<LogLevel, boolean>>({
    info: true,
    warn: true,
    error: true,
    success: true
  })
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => logs.filter((l) => enabled[l.level]), [logs, enabled])

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [filtered, autoScroll])

  const pct = progress?.fraction != null ? Math.round(progress.fraction * 100) : null
  const indeterminate = !!progress && progress.fraction == null && !progress.done

  return (
    <>
      <div className="log-head">
        <h2>Log</h2>
        {LEVELS.map((lv) => (
          <button
            key={lv}
            className={`filter-chip ${enabled[lv] ? 'on' : ''}`}
            onClick={() => setEnabled((e) => ({ ...e, [lv]: !e[lv] }))}
          >
            {lv}
          </button>
        ))}
        <div className="spacer" />
        <button
          className={`filter-chip ${autoScroll ? 'on' : ''}`}
          onClick={() => setAutoScroll((a) => !a)}
          title="Auto-scroll"
        >
          ⤓ auto
        </button>
        <button className="filter-chip" onClick={clearLogs}>
          clear
        </button>
      </div>

      <div className="log-list" ref={listRef}>
        {filtered.length === 0 && <div className="muted">No log entries yet.</div>}
        {filtered.map((l) => (
          <div key={l.id} className={`log-line ${l.level}`}>
            <span className="ts">{new Date(l.timestamp).toLocaleTimeString()}</span>
            <span className="lv">[{l.level}]</span>
            <span className="msg">{l.message}</span>
          </div>
        ))}
      </div>

      {progress && (
        <div className="progress">
          <div className={`bar ${indeterminate ? 'indeterminate' : ''}`}>
            <div style={{ width: pct != null ? `${pct}%` : undefined }} />
          </div>
          <div className="pl">
            {progress.done
              ? progress.cancelled
                ? 'Cancelled'
                : progress.error
                  ? `Error: ${progress.error}`
                  : 'Export complete'
              : `${progress.phase}${progress.detail ? ` · ${progress.detail}` : ''}${
                  progress.current && progress.total
                    ? ` (${progress.current}/${progress.total})`
                    : ''
                }`}
            {progress.outputPath && progress.done && (
              <>
                {' '}
                ·{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    void window.api.dialog.openPath(progress.zipPath || progress.outputPath!)
                  }}
                >
                  Open folder
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
