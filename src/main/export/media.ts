import { promises as fs } from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'
import { DiscordClient } from '../discord/client'
import { ensureDir } from './fsStructure'
import { avatarUrl, CDN } from '../discord/endpoints'
import type { RawUser, RawAttachment, RawSticker } from '../discord/endpoints'
import type { Logger } from '../log/bus'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi'])

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 16)
}

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const e = extname(path).toLowerCase()
    return e && e.length <= 6 ? e : ''
  } catch {
    return ''
  }
}

/**
 * Only download from Discord's own hosts. Embed URLs are chosen by whoever
 * posted the embed (bots, webhooks), so fetching them directly would let any
 * channel member make this machine request arbitrary URLs, including LAN ones.
 * Discord proxies external embed media through images-ext-*.discordapp.net.
 */
export function isDiscordMediaUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    return (
      host === 'discord.com' ||
      host.endsWith('.discord.com') ||
      host.endsWith('.discordapp.com') ||
      host.endsWith('.discordapp.net')
    )
  } catch {
    return false
  }
}

function bucketFor(ext: string): 'images' | 'videos' | 'files' {
  if (IMAGE_EXT.has(ext)) return 'images'
  if (VIDEO_EXT.has(ext)) return 'videos'
  return 'files'
}

export interface MediaOptions {
  includeMedia: boolean
  includeAvatars: boolean
  includeStickers: boolean
}

export interface MediaStats {
  mediaCount: number
  avatarCount: number
  stickerCount: number
  failures: number
}

/**
 * Downloads media for a single channel/thread into its media/ subfolders and
 * returns relative paths (forward-slashed, relative to the channel root) so the
 * generated HTML works offline over file://.
 */
export class MediaDownloader {
  private client: DiscordClient
  private root: string
  private opts: MediaOptions
  private logger?: Logger
  /** url -> relative path (or null if it failed). */
  private cache = new Map<string, string | null>()
  private avatarCache = new Map<string, string | null>()
  stats: MediaStats = { mediaCount: 0, avatarCount: 0, stickerCount: 0, failures: 0 }

  constructor(client: DiscordClient, channelRoot: string, opts: MediaOptions, logger?: Logger) {
    this.client = client
    this.root = channelRoot
    this.opts = opts
    this.logger = logger
  }

  private async save(buffer: Buffer, relPath: string): Promise<void> {
    const full = join(this.root, relPath)
    await ensureDir(join(full, '..'))
    await fs.writeFile(full, buffer)
  }

  /** Download an attachment; returns relative path or null. */
  async attachment(att: RawAttachment): Promise<string | null> {
    if (!this.opts.includeMedia || !isDiscordMediaUrl(att.url)) return null
    const cached = this.cache.get(att.url)
    if (cached !== undefined) return cached

    const ext = extFromUrl(att.url) || (att.content_type ? guessExt(att.content_type) : '') || ''
    const bucket = bucketFor(ext)
    const safe = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
    const rel = `media/${bucket}/${att.id}_${safe}${safe.includes('.') ? '' : ext}`
    const ok = await this.download(att.url, rel)
    const result = ok ? rel : null
    this.cache.set(att.url, result)
    if (ok) this.stats.mediaCount += 1
    else this.stats.failures += 1
    await sleep(100)
    return result
  }

  /** Download an arbitrary media URL (embed image/video, sticker img). */
  async url(mediaUrl: string, prefix = 'embed'): Promise<string | null> {
    if (!this.opts.includeMedia || !isDiscordMediaUrl(mediaUrl)) return null
    const cached = this.cache.get(mediaUrl)
    if (cached !== undefined) return cached
    const ext = extFromUrl(mediaUrl) || '.bin'
    const bucket = bucketFor(ext)
    const rel = `media/${bucket}/${prefix}_${md5(mediaUrl)}${ext}`
    const ok = await this.download(mediaUrl, rel)
    const result = ok ? rel : null
    this.cache.set(mediaUrl, result)
    if (ok) this.stats.mediaCount += 1
    else this.stats.failures += 1
    await sleep(80)
    return result
  }

  /** Download an author avatar; returns relative path or null. */
  async avatar(user: RawUser): Promise<string | null> {
    if (!this.opts.includeAvatars) return null
    const cached = this.avatarCache.get(user.id)
    if (cached !== undefined) return cached
    const src = avatarUrl(user, 128)
    if (!src) {
      this.avatarCache.set(user.id, null)
      return null
    }
    const ext = user.avatar?.startsWith('a_') ? '.gif' : '.png'
    const rel = `media/avatars/${user.id}${ext}`
    const ok = await this.download(src, rel)
    const result = ok ? rel : null
    this.avatarCache.set(user.id, result)
    if (ok) this.stats.avatarCount += 1
    await sleep(60)
    return result
  }

  /** Download a sticker; Lottie (format 3) is saved as JSON. */
  async sticker(sticker: RawSticker): Promise<string | null> {
    if (!this.opts.includeStickers) return null
    const isLottie = sticker.format_type === 3
    const ext = isLottie ? '.json' : sticker.format_type === 4 ? '.gif' : '.png'
    const base = isLottie
      ? `https://discord.com/stickers/${sticker.id}.json`
      : `${CDN}/stickers/${sticker.id}.${sticker.format_type === 4 ? 'gif' : 'png'}`
    const rel = `media/stickers/${sticker.id}${ext}`
    const cached = this.cache.get(base)
    if (cached !== undefined) return cached
    const ok = await this.download(base, rel)
    const result = ok ? rel : null
    this.cache.set(base, result)
    if (ok) this.stats.stickerCount += 1
    await sleep(60)
    return result
  }

  private async download(url: string, relPath: string): Promise<boolean> {
    if (this.client.cancelled()) return false
    const data = await this.client.getBuffer(url)
    if (!data) {
      this.logger?.warn(`Failed to download media: ${shortUrl(url)}`)
      return false
    }
    try {
      await this.save(data.buffer, relPath)
      return true
    } catch (err) {
      this.logger?.warn(`Failed to write media ${relPath}: ${(err as Error).message}`)
      return false
    }
  }
}

function guessExt(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm'
  }
  return map[contentType.split(';')[0]] ?? ''
}

function shortUrl(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() ?? url
  } catch {
    return url.slice(0, 60)
  }
}
