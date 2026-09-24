import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'
import type { LogEntry, LogLevel, ExportProgress } from '../../shared/types'

let counter = 0
function nextId(): string {
  counter += 1
  return `log_${Date.now().toString(36)}_${counter}`
}

class LogBus extends EventEmitter {
  log(level: LogLevel, message: string): void {
    const entry: LogEntry = {
      id: nextId(),
      level,
      message,
      timestamp: new Date().toISOString()
    }
    this.broadcast(IPC.events.log, entry)
    this.emit('log', entry)
  }

  info(message: string): void {
    this.log('info', message)
  }
  warn(message: string): void {
    this.log('warn', message)
  }
  error(message: string): void {
    this.log('error', message)
  }
  success(message: string): void {
    this.log('success', message)
  }

  progress(progress: ExportProgress): void {
    this.broadcast(IPC.events.progress, progress)
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
  }
}

export const logBus = new LogBus()

export type Logger = Pick<LogBus, 'info' | 'warn' | 'error' | 'success' | 'log'>
