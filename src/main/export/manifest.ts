import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import type { ExportMessage } from '../render/normalize'

export interface ChannelManifest {
  channelId: string
  channelName: string
  lastMessageId?: string
  messageCount: number
  optionsHash: string
  phase: 'messages' | 'media' | 'complete'
  exportedAt: string
}

function manifestPath(channelRoot: string): string {
  return join(channelRoot, 'export_manifest.json')
}

function messagesJsonPath(channelRoot: string): string {
  return join(channelRoot, 'messages.json')
}

export function optionsHash(opts: Record<string, unknown>): string {
  return createHash('md5').update(JSON.stringify(opts)).digest('hex').slice(0, 12)
}

export async function readManifest(channelRoot: string): Promise<ChannelManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath(channelRoot), 'utf8')
    return JSON.parse(raw) as ChannelManifest
  } catch {
    return null
  }
}

export async function writeManifest(
  channelRoot: string,
  manifest: ChannelManifest
): Promise<void> {
  await fs.writeFile(manifestPath(channelRoot), JSON.stringify(manifest, null, 2), 'utf8')
}

/** Read previously-exported (public) messages, used by update mode to merge. */
export async function readExistingMessages(channelRoot: string): Promise<ExportMessage[]> {
  try {
    const raw = await fs.readFile(messagesJsonPath(channelRoot), 'utf8')
    const parsed = JSON.parse(raw) as { messages?: ExportMessage[] }
    return Array.isArray(parsed.messages) ? parsed.messages : []
  } catch {
    return []
  }
}
