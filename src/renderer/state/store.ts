import { create } from 'zustand'
import { PRESETS } from '../../shared/types'
import type {
  ConnectedAccount,
  GuildSummary,
  ChannelSummary,
  ThreadSummary,
  DMSummary,
  RoleSummary,
  ExportSettings,
  ExportPreset,
  LogEntry,
  ExportProgress,
  SourceType,
  ExportMode
} from '../../shared/types'

const MAX_LOGS = 2000

function defaultSettings(): ExportSettings {
  return {
    accountId: '',
    sourceType: 'server',
    exportMode: 'full_server',
    excludedChannelIds: [],
    roleFilterEnabled: false,
    roleIds: [],
    preset: 'full_archive',
    includeMessages: true,
    includeMedia: true,
    includeAvatars: true,
    includeStickers: true,
    includeThreads: true,
    createZip: false,
    updateMode: false,
    outputFolder: ''
  }
}

interface AppState {
  accounts: ConnectedAccount[]
  selectedAccountId: string | null

  guilds: GuildSummary[]
  channels: ChannelSummary[]
  dms: DMSummary[]
  roles: RoleSummary[]
  loadingSources: boolean

  settings: ExportSettings
  logs: LogEntry[]
  progress: ExportProgress | null
  jobId: string | null
  exporting: boolean

  // actions
  init: () => Promise<void>
  selectAccount: (id: string) => Promise<void>
  addAccount: (token: string, isBot: boolean) => Promise<{ ok: boolean; error?: string }>
  removeAccount: (id: string) => Promise<void>
  renameAccount: (id: string, label: string) => Promise<void>
  refreshAccount: (id: string) => Promise<void>

  setSourceType: (t: SourceType) => Promise<void>
  selectServer: (serverId: string) => Promise<void>
  setChannel: (channelId: string) => void
  setDm: (dmId: string) => void
  setExportMode: (m: ExportMode) => void
  toggleExcluded: (channelId: string) => void
  setRoleFilterEnabled: (v: boolean) => void
  toggleRole: (roleId: string) => void

  applyPreset: (p: ExportPreset) => void
  setToggle: (key: keyof ExportSettings, value: boolean) => void
  pickFolder: () => Promise<void>

  startExport: () => Promise<void>
  cancelExport: () => Promise<void>

  pushLog: (entry: LogEntry) => void
  clearLogs: () => void
  setProgress: (p: ExportProgress) => void
}

export const useStore = create<AppState>((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  guilds: [],
  channels: [],
  dms: [],
  roles: [],
  loadingSources: false,
  settings: defaultSettings(),
  logs: [],
  progress: null,
  jobId: null,
  exporting: false,

  init: async () => {
    const accounts = await window.api.accounts.list()
    set({ accounts })
    if (accounts.length > 0) {
      await get().selectAccount(accounts[0].id)
    }
  },

  selectAccount: async (id) => {
    set((s) => ({
      selectedAccountId: id,
      settings: {
        ...s.settings,
        accountId: id,
        serverId: undefined,
        channelId: undefined,
        dmId: undefined,
        roleFilterEnabled: false,
        roleIds: []
      },
      guilds: [],
      channels: [],
      dms: [],
      roles: []
    }))
    await get().setSourceType(get().settings.sourceType)
  },

  addAccount: async (token, isBot) => {
    const res = await window.api.accounts.add(token, isBot)
    if (res.ok && res.account) {
      const accounts = await window.api.accounts.list()
      set({ accounts })
      await get().selectAccount(res.account.id)
    }
    return { ok: res.ok, error: res.error }
  },

  removeAccount: async (id) => {
    await window.api.accounts.remove(id)
    const accounts = await window.api.accounts.list()
    set({ accounts })
    if (get().selectedAccountId === id) {
      if (accounts.length > 0) await get().selectAccount(accounts[0].id)
      else set({ selectedAccountId: null, guilds: [], channels: [], dms: [] })
    }
  },

  renameAccount: async (id, label) => {
    await window.api.accounts.rename(id, label)
    const accounts = await window.api.accounts.list()
    set({ accounts })
  },

  refreshAccount: async (id) => {
    await window.api.accounts.refresh(id)
    const accounts = await window.api.accounts.list()
    set({ accounts })
  },

  setSourceType: async (t) => {
    set((s) => ({ settings: { ...s.settings, sourceType: t } }))
    const accId = get().selectedAccountId
    if (!accId) return
    set({ loadingSources: true })
    try {
      if (t === 'server') {
        const guilds = await window.api.discord.getGuilds(accId)
        set({ guilds })
      } else {
        const dms = await window.api.discord.getDMs(accId)
        set({ dms })
      }
    } finally {
      set({ loadingSources: false })
    }
  },

  selectServer: async (serverId) => {
    set((s) => ({
      settings: {
        ...s.settings,
        serverId,
        channelId: undefined,
        excludedChannelIds: [],
        roleFilterEnabled: false,
        roleIds: []
      },
      channels: [],
      roles: []
    }))
    const accId = get().selectedAccountId
    if (!accId) return
    set({ loadingSources: true })
    try {
      const [channels, roles] = await Promise.all([
        window.api.discord.getChannels(accId, serverId),
        window.api.discord.getRoles(accId, serverId)
      ])
      set({ channels, roles })
    } finally {
      set({ loadingSources: false })
    }
  },

  setChannel: (channelId) => set((s) => ({ settings: { ...s.settings, channelId } })),
  setDm: (dmId) => set((s) => ({ settings: { ...s.settings, dmId } })),
  setExportMode: (m) => set((s) => ({ settings: { ...s.settings, exportMode: m } })),

  toggleExcluded: (channelId) =>
    set((s) => {
      const set2 = new Set(s.settings.excludedChannelIds)
      if (set2.has(channelId)) set2.delete(channelId)
      else set2.add(channelId)
      return { settings: { ...s.settings, excludedChannelIds: [...set2] } }
    }),

  setRoleFilterEnabled: (v) =>
    set((s) => ({ settings: { ...s.settings, roleFilterEnabled: v } })),

  toggleRole: (roleId) =>
    set((s) => {
      const set2 = new Set(s.settings.roleIds)
      if (set2.has(roleId)) set2.delete(roleId)
      else set2.add(roleId)
      return { settings: { ...s.settings, roleIds: [...set2] } }
    }),

  applyPreset: (p) =>
    set((s) => {
      if (p === 'custom') return { settings: { ...s.settings, preset: 'custom' } }
      const def = PRESETS[p]
      return { settings: { ...s.settings, preset: p, ...def } }
    }),

  setToggle: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value, preset: 'custom' } })),

  pickFolder: async () => {
    const folder = await window.api.dialog.pickOutputFolder()
    if (folder) set((s) => ({ settings: { ...s.settings, outputFolder: folder } }))
  },

  startExport: async () => {
    const { settings } = get()
    set({ exporting: true, progress: { jobId: '', phase: 'starting', fraction: null } })
    const { jobId } = await window.api.exporter.start(settings)
    if (!jobId) {
      set({ exporting: false, progress: null })
      return
    }
    set({ jobId })
  },

  cancelExport: async () => {
    const jobId = get().jobId
    if (jobId) await window.api.exporter.cancel(jobId)
  },

  pushLog: (entry) =>
    set((s) => {
      const logs = s.logs.length >= MAX_LOGS ? s.logs.slice(-MAX_LOGS + 1) : s.logs
      return { logs: [...logs, entry] }
    }),

  clearLogs: () => set({ logs: [] }),

  setProgress: (p) =>
    set(() => {
      if (p.done) {
        return { progress: p, exporting: false, jobId: null }
      }
      return { progress: p }
    })
}))
