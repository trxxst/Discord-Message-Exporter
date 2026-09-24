import { promises as fs } from 'fs'
import { join } from 'path'

// Device names Windows refuses as a file or folder name, with or without an extension.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i

/** Make a string safe to use as a folder/file name across platforms. */
export function sanitizeName(name: string, fallback = 'unnamed'): string {
  const cleaned = (name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    // Trim after slicing so a cut never leaves a trailing dot (Windows drops it).
    .replace(/^[-.]+|[-.]+$/g, '')
  if (!cleaned) return fallback
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

/**
 * Resolve a unique directory name within `parent`, appending the id when a
 * collision would occur, so two channels named "general" don't clobber.
 */
export function uniqueDirName(used: Set<string>, base: string, id: string): string {
  let name = base
  if (used.has(name.toLowerCase())) {
    name = `${base}-${id.slice(-6)}`
  }
  used.add(name.toLowerCase())
  return name
}

export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

export interface ChannelDirs {
  root: string
  media: string
  mediaImages: string
  mediaVideos: string
  mediaFiles: string
  avatars: string
  stickers: string
}

/** Create the per-channel/thread folder structure and return the paths. */
export async function createChannelDirs(channelRoot: string): Promise<ChannelDirs> {
  const dirs: ChannelDirs = {
    root: channelRoot,
    media: join(channelRoot, 'media'),
    mediaImages: join(channelRoot, 'media', 'images'),
    mediaVideos: join(channelRoot, 'media', 'videos'),
    mediaFiles: join(channelRoot, 'media', 'files'),
    avatars: join(channelRoot, 'media', 'avatars'),
    stickers: join(channelRoot, 'media', 'stickers')
  }
  await ensureDir(dirs.root)
  return dirs
}
