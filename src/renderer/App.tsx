import React, { useEffect, useState } from 'react'
import { useStore } from './state/store'
import { TopBar } from './components/TopBar'
import { AccountsPanel } from './components/AccountsPanel'
import { SourceTargetPanel } from './components/SourceTargetPanel'
import { DownloadOptionsPanel } from './components/DownloadOptionsPanel'
import { LogPanel } from './components/LogPanel'
import { loadTheme, applyTheme } from './theme/themes'

export function App(): React.JSX.Element {
  const init = useStore((s) => s.init)
  const pushLog = useStore((s) => s.pushLog)
  const setProgress = useStore((s) => s.setProgress)
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    const t = loadTheme()
    applyTheme(t)
    setTheme(t)
    void init()
    const offLog = window.api.events.onLog(pushLog)
    const offProgress = window.api.events.onProgress(setProgress)
    return () => {
      offLog()
      offProgress()
    }
  }, [init, pushLog, setProgress])

  return (
    <div className="app">
      <TopBar theme={theme} onTheme={setTheme} />
      <div className="body">
        <div className="col left">
          <AccountsPanel />
        </div>
        <div className="col">
          <SourceTargetPanel />
          <DownloadOptionsPanel />
        </div>
        <div className="col right">
          <LogPanel />
        </div>
      </div>
    </div>
  )
}
