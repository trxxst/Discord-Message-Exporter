import { MediaDownloader } from '../export/media'
import { displayName } from '../discord/endpoints'
import type { RawMessage, RawEmbed } from '../discord/endpoints'

// Public, offline-friendly message shape written to messages.json and embedded
// into the HTML transcript. Matches the goal.txt example, enriched with local
// media paths (relative to the channel folder).

export interface ExportAuthor {
  id: string
  username: string
  /** Local relative path to the avatar, or null. */
  avatar: string | null
}

export interface ExportAttachment {
  id: string
  filename: string
  /** Local relative path, or null if not downloaded. */
  localPath: string | null
  url: string
  contentType?: string
  size?: number
  width?: number
  height?: number
}

export interface ExportEmbed {
  type?: string
  title?: string
  description?: string
  url?: string
  color?: number
  author?: { name?: string; url?: string }
  footer?: { text?: string }
  fields?: { name: string; value: string; inline?: boolean }[]
  image?: { localPath: string | null; url?: string }
  thumbnail?: { localPath: string | null; url?: string }
}

export interface ExportSticker {
  id: string
  name: string
  formatType: number
  localPath: string | null
}

export interface ExportReply {
  id: string
  author: string
  contentPreview: string
}

export interface ExportMessage {
  id: string
  author: ExportAuthor
  timestamp: string
  editedTimestamp: string | null
  content: string
  attachments: ExportAttachment[]
  embeds: ExportEmbed[]
  stickers: ExportSticker[]
  replyTo: ExportReply | null
  pinned?: boolean
}

/**
 * Convert a raw Discord message into the export shape, downloading any media
 * the toggles allow via the supplied downloader.
 */
export async function normalizeMessage(
  msg: RawMessage,
  media: MediaDownloader
): Promise<ExportMessage> {
  const avatar = await media.avatar(msg.author)

  const attachments: ExportAttachment[] = []
  for (const att of msg.attachments ?? []) {
    const localPath = await media.attachment(att)
    attachments.push({
      id: att.id,
      filename: att.filename,
      localPath,
      url: att.url,
      contentType: att.content_type,
      size: att.size,
      width: att.width,
      height: att.height
    })
  }

  const embeds: ExportEmbed[] = []
  for (const e of msg.embeds ?? []) {
    embeds.push(await normalizeEmbed(e, media))
  }

  const stickers: ExportSticker[] = []
  for (const s of msg.sticker_items ?? []) {
    const localPath = await media.sticker(s)
    stickers.push({ id: s.id, name: s.name, formatType: s.format_type, localPath })
  }

  let replyTo: ExportReply | null = null
  if (msg.referenced_message) {
    const r = msg.referenced_message
    replyTo = {
      id: r.id,
      author: displayName(r.author),
      contentPreview: (r.content ?? '').slice(0, 120)
    }
  }

  return {
    id: msg.id,
    author: {
      id: msg.author.id,
      username: displayName(msg.author),
      avatar
    },
    timestamp: msg.timestamp,
    editedTimestamp: msg.edited_timestamp ?? null,
    content: msg.content ?? '',
    attachments,
    embeds,
    stickers,
    replyTo,
    pinned: msg.pinned
  }
}

async function normalizeEmbed(e: RawEmbed, media: MediaDownloader): Promise<ExportEmbed> {
  const out: ExportEmbed = {
    type: e.type,
    title: e.title,
    description: e.description,
    url: e.url,
    color: e.color,
    author: e.author ? { name: e.author.name, url: e.author.url } : undefined,
    footer: e.footer ? { text: e.footer.text } : undefined,
    fields: e.fields
  }
  // Download through Discord's media proxy; the original URL can point anywhere.
  if (e.image?.url) {
    const src = e.image.proxy_url ?? e.image.url
    out.image = { localPath: await media.url(src, 'embed'), url: e.image.url }
  }
  if (e.thumbnail?.url) {
    const src = e.thumbnail.proxy_url ?? e.thumbnail.url
    out.thumbnail = { localPath: await media.url(src, 'thumb'), url: e.thumbnail.url }
  }
  return out
}

export function countMedia(messages: ExportMessage[]): number {
  let n = 0
  for (const m of messages) {
    n += m.attachments.filter((a) => a.localPath).length
    n += m.stickers.filter((s) => s.localPath).length
    for (const e of m.embeds) {
      if (e.image?.localPath) n += 1
      if (e.thumbnail?.localPath) n += 1
    }
  }
  return n
}
