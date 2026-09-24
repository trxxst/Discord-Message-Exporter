import { DiscordClient, DiscordError } from './client'
import type {
  GuildSummary,
  ChannelSummary,
  ThreadSummary,
  DMSummary,
  RoleSummary
} from '../../shared/types'

// ---- Raw Discord API shapes (only the fields we use) ----

export interface RawUser {
  id: string
  username: string
  global_name?: string | null
  discriminator?: string
  avatar?: string | null
}

export interface RawGuild {
  id: string
  name: string
  icon?: string | null
  owner?: boolean
}

export interface RawRole {
  id: string
  name: string
  color?: number
  position?: number
}

export interface RawMember {
  user?: RawUser
  roles: string[]
  nick?: string | null
}

export interface RawChannel {
  id: string
  type: number
  name?: string
  topic?: string | null
  parent_id?: string | null
  position?: number
  guild_id?: string
  recipients?: RawUser[]
  icon?: string | null
  thread_metadata?: { archived?: boolean; archive_timestamp?: string }
}

export interface RawAttachment {
  id: string
  filename: string
  url: string
  proxy_url?: string
  content_type?: string
  size?: number
  width?: number
  height?: number
}

export interface RawEmbed {
  type?: string
  title?: string
  description?: string
  url?: string
  timestamp?: string
  color?: number
  image?: { url?: string; proxy_url?: string }
  thumbnail?: { url?: string; proxy_url?: string }
  video?: { url?: string; proxy_url?: string }
  author?: { name?: string; url?: string; icon_url?: string }
  footer?: { text?: string; icon_url?: string }
  fields?: { name: string; value: string; inline?: boolean }[]
}

export interface RawSticker {
  id: string
  name: string
  format_type: number // 1=PNG, 2=APNG, 3=Lottie, 4=GIF
}

export interface RawMessage {
  id: string
  channel_id?: string
  author: RawUser
  content: string
  timestamp: string
  edited_timestamp?: string | null
  attachments: RawAttachment[]
  embeds: RawEmbed[]
  sticker_items?: RawSticker[]
  type?: number
  pinned?: boolean
  mention_everyone?: boolean
  referenced_message?: RawMessage | null
  message_reference?: { message_id?: string; channel_id?: string }
  reactions?: { count: number; emoji: { id?: string | null; name?: string } }[]
}

export const CDN = 'https://cdn.discordapp.com'

export function avatarUrl(user: RawUser, size = 128): string | undefined {
  if (!user.avatar) return undefined
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png'
  return `${CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`
}

export function guildIconUrl(guild: RawGuild, size = 256): string | undefined {
  if (!guild.icon) return undefined
  const ext = guild.icon.startsWith('a_') ? 'gif' : 'png'
  return `${CDN}/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`
}

export function displayName(user: RawUser): string {
  return user.global_name || user.username || 'Unknown'
}

// Text-like channel types we can export.
const EXPORTABLE_CHANNEL_TYPES = new Set([0, 5, 15, 16]) // text, announcement, forum, media

/** Forum and media channels hold no messages of their own; every post is a thread. */
export const THREAD_ONLY_CHANNEL_TYPES = new Set([15, 16])

export const endpoints = {
  async me(client: DiscordClient): Promise<RawUser> {
    return client.get<RawUser>('/users/@me')
  },

  async guilds(client: DiscordClient): Promise<GuildSummary[]> {
    const raw = await client.get<RawGuild[]>('/users/@me/guilds')
    return raw.map((g) => ({
      id: g.id,
      name: g.name,
      iconUrl: guildIconUrl(g),
      owner: g.owner
    }))
  },

  async guild(client: DiscordClient, guildId: string): Promise<RawGuild> {
    return client.get<RawGuild>(`/guilds/${guildId}`)
  },

  async roles(client: DiscordClient, guildId: string): Promise<RoleSummary[]> {
    const raw = await client.get<RawRole[]>(`/guilds/${guildId}/roles`)
    return raw
      .filter((r) => r.id !== guildId) // drop @everyone
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color ?? 0,
        position: r.position ?? 0
      }))
      .sort((a, b) => b.position - a.position)
  },

  /** Single-member lookup; null when the user isn't a member or access is denied. */
  async member(
    client: DiscordClient,
    guildId: string,
    userId: string
  ): Promise<RawMember | null> {
    try {
      return await client.get<RawMember>(`/guilds/${guildId}/members/${userId}`)
    } catch (err) {
      if (err instanceof DiscordError && (err.status === 404 || err.status === 403)) {
        return null
      }
      throw err
    }
  },

  async channels(client: DiscordClient, guildId: string): Promise<ChannelSummary[]> {
    const raw = await client.get<RawChannel[]>(`/guilds/${guildId}/channels`)
    return raw
      .filter((c) => EXPORTABLE_CHANNEL_TYPES.has(c.type))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => ({
        id: c.id,
        name: c.name ?? c.id,
        type: c.type,
        topic: c.topic ?? undefined,
        parentId: c.parent_id ?? undefined,
        position: c.position
      }))
  },

  async rawChannel(client: DiscordClient, channelId: string): Promise<RawChannel> {
    return client.get<RawChannel>(`/channels/${channelId}`)
  },

  /**
   * Every active thread in the guild the account can see. API v10 only lists
   * active threads per guild (the per-channel endpoint was decommissioned), so
   * fetch once and pass the result to threads() for each channel.
   */
  async activeGuildThreads(client: DiscordClient, guildId: string): Promise<RawChannel[]> {
    const res = await client.get<{ threads?: RawChannel[] }>(`/guilds/${guildId}/threads/active`)
    return res.threads ?? []
  },

  async threads(
    client: DiscordClient,
    channelId: string,
    guildActiveThreads: RawChannel[] = []
  ): Promise<ThreadSummary[]> {
    const out: ThreadSummary[] = []
    const seen = new Set<string>()

    for (const t of guildActiveThreads) {
      if (t.parent_id === channelId && !seen.has(t.id)) {
        seen.add(t.id)
        out.push({ id: t.id, name: t.name ?? t.id, parentId: channelId, archived: false })
      }
    }

    // Public archived threads are paginated by archive_timestamp (ISO8601),
    // newest first.
    let before: string | undefined
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (client.cancelled()) break
      const params: Record<string, string | number> = { limit: 100 }
      if (before) params.before = before
      let page: { threads: RawChannel[]; has_more?: boolean }
      try {
        page = await client.get(`/channels/${channelId}/threads/archived/public`, params)
      } catch {
        break
      }
      const threads = page.threads ?? []
      for (const t of threads) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          out.push({ id: t.id, name: t.name ?? t.id, parentId: channelId, archived: true })
        }
      }
      const oldest = threads[threads.length - 1]?.thread_metadata?.archive_timestamp
      if (!page.has_more || !oldest || oldest === before) break
      before = oldest
    }

    return out
  },

  async dms(client: DiscordClient): Promise<DMSummary[]> {
    // Bots cannot list DM channels; this returns [] for bot tokens.
    if (client.botMode) return []
    let raw: RawChannel[] = []
    try {
      raw = await client.get<RawChannel[]>('/users/@me/channels')
    } catch {
      return []
    }
    return raw.map((c) => {
      const recipients = (c.recipients ?? []).map(displayName)
      const name =
        c.type === 3
          ? c.name || recipients.join(', ') || 'Group DM'
          : recipients[0] || 'Direct Message'
      return {
        id: c.id,
        type: c.type,
        name,
        recipients
      }
    })
  }
}
