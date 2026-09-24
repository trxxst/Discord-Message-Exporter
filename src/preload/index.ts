import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  Api,
  ConnectedAccount,
  AddAccountResult,
  SimpleResult,
  GuildSummary,
  ChannelSummary,
  ThreadSummary,
  DMSummary,
  RoleSummary,
  ExportSettings,
  LogEntry,
  ExportProgress
} from '../shared/types'

const api: Api = {
  accounts: {
    list: () => ipcRenderer.invoke(IPC.accounts.list) as Promise<ConnectedAccount[]>,
    add: (token, isBot) =>
      ipcRenderer.invoke(IPC.accounts.add, token, isBot) as Promise<AddAccountResult>,
    remove: (id) => ipcRenderer.invoke(IPC.accounts.remove, id) as Promise<SimpleResult>,
    rename: (id, label) =>
      ipcRenderer.invoke(IPC.accounts.rename, id, label) as Promise<SimpleResult>,
    refresh: (id) => ipcRenderer.invoke(IPC.accounts.refresh, id) as Promise<AddAccountResult>
  },
  discord: {
    getGuilds: (accountId) =>
      ipcRenderer.invoke(IPC.discord.getGuilds, accountId) as Promise<GuildSummary[]>,
    getChannels: (accountId, guildId) =>
      ipcRenderer.invoke(IPC.discord.getChannels, accountId, guildId) as Promise<ChannelSummary[]>,
    getThreads: (accountId, channelId) =>
      ipcRenderer.invoke(IPC.discord.getThreads, accountId, channelId) as Promise<ThreadSummary[]>,
    getDMs: (accountId) =>
      ipcRenderer.invoke(IPC.discord.getDMs, accountId) as Promise<DMSummary[]>,
    getRoles: (accountId, guildId) =>
      ipcRenderer.invoke(IPC.discord.getRoles, accountId, guildId) as Promise<RoleSummary[]>
  },
  exporter: {
    start: (settings: ExportSettings) =>
      ipcRenderer.invoke(IPC.exporter.start, settings) as Promise<{ jobId: string }>,
    cancel: (jobId) => ipcRenderer.invoke(IPC.exporter.cancel, jobId) as Promise<SimpleResult>
  },
  dialog: {
    pickOutputFolder: () =>
      ipcRenderer.invoke(IPC.dialog.pickOutputFolder) as Promise<string | null>,
    openPath: (path) => ipcRenderer.invoke(IPC.dialog.openPath, path) as Promise<void>
  },
  events: {
    onLog: (cb: (entry: LogEntry) => void) => {
      const listener = (_e: unknown, entry: LogEntry) => cb(entry)
      ipcRenderer.on(IPC.events.log, listener)
      return () => ipcRenderer.removeListener(IPC.events.log, listener)
    },
    onProgress: (cb: (progress: ExportProgress) => void) => {
      const listener = (_e: unknown, progress: ExportProgress) => cb(progress)
      ipcRenderer.on(IPC.events.progress, listener)
      return () => ipcRenderer.removeListener(IPC.events.progress, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
