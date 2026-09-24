// Shared types used across main, preload, and renderer.

export type AuthType = 'oauth' | 'bot' | 'user'

export interface ConnectedAccount {
  id: string
  username: string
  discriminator?: string
  avatarUrl?: string
  authType: AuthType
  /** Whether the stored token is a bot token (Authorization: "Bot <token>"). */
  isBot: boolean
  /** User-chosen local display name (optional override). */
  label?: string
  createdAt: string
  lastConnectedAt?: string
  /** Last known connection status from a refresh / validation. */
  status?: ConnectionStatus
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'invalid' | 'unknown'

export type SourceType = 'server' | 'dm'

export type ExportMode = 'single_channel' | 'full_server' | 'exclude_channels'

export type ExportPreset = 'full_archive' | 'messages_only' | 'media_only' | 'minimal' | 'custom'

export interface ExportSettings {
  accountId: string
  sourceType: SourceType

  serverId?: string
  channelId?: string
  dmId?: string

  exportMode: ExportMode
  excludedChannelIds: string[]

  /** When on, only export content from members who currently hold one of roleIds. */
  roleFilterEnabled: boolean
  roleIds: string[]

  preset: ExportPreset

  includeMessages: boolean
  includeMedia: boolean
  includeAvatars: boolean
  includeStickers: boolean
  includeThreads: boolean

  createZip: boolean
  updateMode: boolean

  outputFolder: string
}

export interface PresetDefinition {
  includeMessages: boolean
  includeMedia: boolean
  includeAvatars: boolean
  includeStickers: boolean
  includeThreads: boolean
}

export const PRESETS: Record<Exclude<ExportPreset, 'custom'>, PresetDefinition> = {
  full_archive: {
    includeMessages: true,
    includeMedia: true,
    includeAvatars: true,
    includeStickers: true,
    includeThreads: true
  },
  messages_only: {
    includeMessages: true,
    includeMedia: false,
    includeAvatars: false,
    includeStickers: false,
    includeThreads: true
  },
  media_only: {
    includeMessages: true,
    includeMedia: true,
    includeAvatars: false,
    includeStickers: false,
    includeThreads: false
  },
  minimal: {
    includeMessages: true,
    includeMedia: false,
    includeAvatars: false,
    includeStickers: false,
    includeThreads: false
  }
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success'

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: string
}

export interface ExportProgress {
  jobId: string
  phase: string
  /** 0..1 overall fraction, or null when indeterminate. */
  fraction: number | null
  current?: number
  total?: number
  detail?: string
  done?: boolean
  cancelled?: boolean
  error?: string
  /** Path to the produced archive folder (set on completion). */
  outputPath?: string
  /** Path to the produced ZIP (set when createZip succeeds). */
  zipPath?: string
}

// ---- Discord lightweight DTOs surfaced to the renderer ----

export interface GuildSummary {
  id: string
  name: string
  iconUrl?: string
  owner?: boolean
}

export interface ChannelSummary {
  id: string
  name: string
  /** Raw Discord channel type. 0 = text, 5 = announcement, 15 = forum, etc. */
  type: number
  topic?: string
  parentId?: string
  position?: number
}

export interface ThreadSummary {
  id: string
  name: string
  parentId: string
  archived?: boolean
}

export interface DMSummary {
  id: string
  /** 1 = DM, 3 = group DM. */
  type: number
  name: string
  iconUrl?: string
  recipients: string[]
}

export interface RoleSummary {
  id: string
  name: string
  /** Discord integer color (0 = no color). */
  color: number
  position: number
}

// ---- IPC results ----

export interface AddAccountResult {
  ok: boolean
  account?: ConnectedAccount
  error?: string
}

export interface SimpleResult {
  ok: boolean
  error?: string
}

// ---- The bridge surface exposed on window.api ----

export interface Api {
  accounts: {
    list(): Promise<ConnectedAccount[]>
    add(token: string, isBot: boolean): Promise<AddAccountResult>
    remove(id: string): Promise<SimpleResult>
    rename(id: string, label: string): Promise<SimpleResult>
    refresh(id: string): Promise<AddAccountResult>
  }
  discord: {
    getGuilds(accountId: string): Promise<GuildSummary[]>
    getChannels(accountId: string, guildId: string): Promise<ChannelSummary[]>
    getThreads(accountId: string, channelId: string): Promise<ThreadSummary[]>
    getDMs(accountId: string): Promise<DMSummary[]>
    getRoles(accountId: string, guildId: string): Promise<RoleSummary[]>
  }
  exporter: {
    start(settings: ExportSettings): Promise<{ jobId: string }>
    cancel(jobId: string): Promise<SimpleResult>
  }
  dialog: {
    pickOutputFolder(): Promise<string | null>
    openPath(path: string): Promise<void>
  }
  events: {
    onLog(cb: (entry: LogEntry) => void): () => void
    onProgress(cb: (progress: ExportProgress) => void): () => void
  }
}
