import { promises as fs } from 'fs'
import { join, isAbsolute, resolve } from 'path'
import { randomUUID } from 'crypto'
import { DiscordClient, DiscordError } from '../discord/client'
import { endpoints, guildIconUrl, THREAD_ONLY_CHANNEL_TYPES } from '../discord/endpoints'
import type { RawGuild, RawChannel, RawMessage } from '../discord/endpoints'
import { fetchAllMessages, fetchPinned, snowflakeCompare } from '../discord/pagination'
import { MediaDownloader } from './media'
import {
  sanitizeName,
  uniqueDirName,
  ensureDir,
  createChannelDirs
} from './fsStructure'
import {
  optionsHash,
  readManifest,
  writeManifest,
  readExistingMessages
} from './manifest'
import { createZip } from './zip'
import { RoleFilter } from './roleFilter'
import { normalizeMessage, countMedia } from '../render/normalize'
import type { ExportMessage } from '../render/normalize'
import { writeMessagesJson } from '../render/messagesJson'
import { writeMessagesHtml } from '../render/messagesHtml'
import { writeChannelIndex } from '../render/channelIndex'
import { writeServerIndex } from '../render/serverIndex'
import type {
  IndexChannelEntry,
  IndexThreadEntry
} from '../render/serverIndex'
import { writeAssets } from '../render/assets'
import { logBus } from '../log/bus'
import type { ExportSettings, ExportProgress } from '../../shared/types'

interface Job {
  id: string
  cancelled: boolean
}

const jobs = new Map<string, Job>()

/** Folders and ZIPs produced by exports in this session (for the "Open folder" link). */
const exportOutputs = new Set<string>()

export function isExportOutput(path: string): boolean {
  return typeof path === 'string' && exportOutputs.has(resolve(path))
}

export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId)
  if (!job) return false
  job.cancelled = true
  return true
}

interface MediaToggles {
  includeMessages: boolean
  includeMedia: boolean
  includeAvatars: boolean
  includeStickers: boolean
}

/**
 * Kick off an export. Returns the jobId immediately; the work runs in the
 * background and streams logs + progress over the bus.
 */
export function startExport(
  settings: ExportSettings,
  token: string,
  isBot: boolean
): string {
  const jobId = randomUUID()
  const job: Job = { id: jobId, cancelled: false }
  jobs.set(jobId, job)

  void runExport(jobId, job, settings, token, isBot).catch((err) => {
    logBus.error(`Export crashed: ${(err as Error).message}`)
    emit({ jobId, phase: 'error', fraction: null, done: true, error: (err as Error).message })
  }).finally(() => {
    jobs.delete(jobId)
  })

  return jobId
}

function emit(p: ExportProgress): void {
  logBus.progress(p)
}

async function runExport(
  jobId: string,
  job: Job,
  settings: ExportSettings,
  token: string,
  isBot: boolean
): Promise<void> {
  const client = new DiscordClient({
    token,
    isBot,
    logger: logBus,
    isCancelled: () => job.cancelled
  })

  emit({ jobId, phase: 'validating', fraction: null, detail: 'Validating account…' })

  // Validate the output folder first: a relative or empty path would resolve
  // against the app's working directory.
  const outputOk =
    !!settings.outputFolder &&
    isAbsolute(settings.outputFolder) &&
    (await fs.stat(settings.outputFolder).then((s) => s.isDirectory()).catch(() => false))
  if (!outputOk) {
    logBus.error(`Output folder is missing or not a directory: ${settings.outputFolder || '(none)'}`)
    emit({ jobId, phase: 'error', fraction: null, done: true, error: 'Invalid output folder' })
    return
  }

  // 1. Validate connection.
  let me
  try {
    me = await endpoints.me(client)
  } catch (err) {
    logBus.error(`Authentication failed: ${(err as Error).message}`)
    emit({ jobId, phase: 'error', fraction: null, done: true, error: 'Authentication failed' })
    return
  }
  logBus.success(`Connected as ${me.username}`)

  const toggles: MediaToggles = {
    includeMessages: settings.includeMessages,
    includeMedia: settings.includeMedia,
    includeAvatars: settings.includeAvatars,
    includeStickers: settings.includeStickers
  }

  if (settings.sourceType === 'dm') {
    await runDmExport(jobId, job, client, settings, toggles)
  } else {
    await runServerExport(jobId, job, client, settings, toggles)
  }
}

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

async function runServerExport(
  jobId: string,
  job: Job,
  client: DiscordClient,
  settings: ExportSettings,
  toggles: MediaToggles
): Promise<void> {
  if (!settings.serverId) {
    emit({ jobId, phase: 'error', fraction: null, done: true, error: 'No server selected' })
    return
  }

  let guild: RawGuild
  try {
    guild = await endpoints.guild(client, settings.serverId)
  } catch (err) {
    logBus.error(`Failed to load server: ${(err as Error).message}`)
    emit({ jobId, phase: 'error', fraction: null, done: true, error: 'Failed to load server' })
    return
  }

  const serverRoot = join(settings.outputFolder, sanitizeName(guild.name, 'server'))
  await ensureDir(serverRoot)
  await ensureDir(join(serverRoot, 'channels'))
  await ensureDir(join(serverRoot, 'threads'))
  await writeAssets(serverRoot)
  logBus.info(`Backup folder: ${serverRoot}`)

  // Server icon.
  let iconRelPath: string | undefined
  const iconUrl = guildIconUrl(guild, 256)
  if (iconUrl) {
    const data = await client.getBuffer(iconUrl)
    if (data) {
      await fs.writeFile(join(serverRoot, 'server-icon.png'), data.buffer)
      iconRelPath = 'server-icon.png'
    }
  }

  // Resolve target channels.
  logBus.info('Loading channels…')
  let channels = await endpoints.channels(client, settings.serverId)
  logBus.success(`Loaded ${channels.length} channels`)

  if (settings.exportMode === 'single_channel' && settings.channelId) {
    channels = channels.filter((c) => c.id === settings.channelId)
  } else if (settings.exportMode === 'exclude_channels') {
    const excluded = new Set(settings.excludedChannelIds)
    channels = channels.filter((c) => !excluded.has(c.id))
  }

  const usedChannelDirs = new Set<string>()
  const usedThreadDirs = new Set<string>()
  const channelEntries: IndexChannelEntry[] = []
  const threadEntries: IndexThreadEntry[] = []

  // One shared role filter for the whole guild, so the per-author membership
  // cache persists across every channel and thread.
  const roleFilter =
    settings.roleFilterEnabled && settings.roleIds.length > 0
      ? new RoleFilter(client, settings.serverId, new Set(settings.roleIds), true, logBus)
      : undefined
  if (roleFilter) {
    logBus.info(`Role filter active: ${settings.roleIds.length} role(s) - any-of match`)
  }

  // Active threads are listed per guild in API v10; fetch them once.
  let guildActiveThreads: RawChannel[] = []
  if (settings.includeThreads || channels.some((c) => THREAD_ONLY_CHANNEL_TYPES.has(c.type))) {
    try {
      guildActiveThreads = await endpoints.activeGuildThreads(client, settings.serverId)
    } catch (err) {
      logBus.warn(`Could not list active threads: ${(err as Error).message}`)
    }
  }

  const optsHash = optionsHash({
    ...toggles,
    update: settings.updateMode,
    roleIds: roleFilter ? [...settings.roleIds].sort() : []
  })

  for (let i = 0; i < channels.length; i++) {
    if (job.cancelled) break
    const ch = channels[i]
    emit({
      jobId,
      phase: 'channels',
      fraction: channels.length ? i / channels.length : null,
      current: i + 1,
      total: channels.length,
      detail: `#${ch.name}`
    })

    const dirName = uniqueDirName(usedChannelDirs, sanitizeName(ch.name, ch.id), ch.id)
    const channelRoot = join(serverRoot, 'channels', dirName)
    const threadOnly = THREAD_ONLY_CHANNEL_TYPES.has(ch.type)

    try {
      const result = await exportConversation(client, ch.id, channelRoot, {
        kind: 'channel',
        name: ch.name,
        topic: ch.topic,
        toggles,
        updateMode: settings.updateMode,
        optsHash,
        assetsPath: '../../assets',
        serverHref: '../../index.html',
        roleFilter,
        threadOnly
      })
      channelEntries.push({
        name: ch.name,
        dirName,
        messageCount: result.messageCount,
        mediaCount: result.mediaCount
      })
      if (threadOnly) logBus.info(`#${ch.name} is a forum; exporting its posts as threads`)
      else logBus.success(`Exported #${ch.name} (${result.messageCount} messages)`)
    } catch (err) {
      if (job.cancelled) break
      logBus.error(`Failed to export #${ch.name}: ${(err as Error).message}`)
      continue
    }

    // Threads belonging to this channel (for a forum, these are its posts).
    if ((settings.includeThreads || threadOnly) && !job.cancelled) {
      let threads: { id: string; name: string }[] = []
      try {
        threads = await endpoints.threads(client, ch.id, guildActiveThreads)
      } catch (err) {
        logBus.warn(`Could not list threads for #${ch.name}: ${(err as Error).message}`)
      }
      for (const th of threads) {
        if (job.cancelled) break
        const tDir = uniqueDirName(usedThreadDirs, sanitizeName(th.name, th.id), th.id)
        const threadRoot = join(serverRoot, 'threads', tDir)
        try {
          const result = await exportConversation(client, th.id, threadRoot, {
            kind: 'thread',
            name: th.name,
            parentName: ch.name,
            parentHref: `../../channels/${encodeURIComponent(dirName)}/index.html`,
            toggles,
            updateMode: settings.updateMode,
            optsHash,
            assetsPath: '../../assets',
            serverHref: '../../index.html',
            roleFilter
          })
          threadEntries.push({
            name: th.name,
            dirName: tDir,
            parentName: ch.name,
            messageCount: result.messageCount,
            mediaCount: result.mediaCount
          })
          logBus.success(`Exported thread 🧵 ${th.name} (${result.messageCount} messages)`)
        } catch (err) {
          if (job.cancelled) break
          logBus.error(`Failed to export thread ${th.name}: ${(err as Error).message}`)
        }
      }
    }
  }

  const exportedAt = new Date().toISOString()

  // Keep entries from earlier exports into this folder that this run did not
  // touch (single channel, exclusions, cancellation), so index.html still
  // links the whole archive instead of only what was just exported.
  const previous = await readPreviousMetadata(serverRoot)
  const allChannels = await mergeEntries(serverRoot, 'channels', previous.channels, channelEntries)
  const allThreads = await mergeEntries(serverRoot, 'threads', previous.threads, threadEntries)
  const totalMessages = sum(allChannels, 'messageCount') + sum(allThreads, 'messageCount')
  const totalMedia = sum(allChannels, 'mediaCount') + sum(allThreads, 'mediaCount')

  // metadata.json
  const metadata = {
    serverName: guild.name,
    serverId: guild.id,
    exportedAt,
    channelCount: allChannels.length,
    threadCount: allThreads.length,
    totalMessages,
    totalMedia,
    channels: allChannels,
    threads: allThreads
  }
  await fs.writeFile(join(serverRoot, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8')

  // Server index.html
  await writeServerIndex(serverRoot, {
    serverName: guild.name,
    serverId: guild.id,
    iconRelPath,
    exportedAt,
    channels: allChannels,
    threads: allThreads,
    totalMessages,
    totalMedia
  })

  await finalize(jobId, job, settings, serverRoot, guild.name)
}

// ---------------------------------------------------------------------------
// DM export
// ---------------------------------------------------------------------------

async function runDmExport(
  jobId: string,
  job: Job,
  client: DiscordClient,
  settings: ExportSettings,
  toggles: MediaToggles
): Promise<void> {
  if (!settings.dmId) {
    emit({ jobId, phase: 'error', fraction: null, done: true, error: 'No DM selected' })
    return
  }

  // Resolve a friendly name from the DM list when possible.
  let dmName = `dm-${settings.dmId.slice(-6)}`
  try {
    const dms = await endpoints.dms(client)
    const match = dms.find((d) => d.id === settings.dmId)
    if (match) dmName = match.name
  } catch {
    /* ignore */
  }

  const serverRoot = join(settings.outputFolder, sanitizeName(dmName, 'dm'))
  await ensureDir(serverRoot)
  await ensureDir(join(serverRoot, 'channels'))
  await writeAssets(serverRoot)
  logBus.info(`Backup folder: ${serverRoot}`)

  const dirName = sanitizeName(dmName, 'conversation')
  const channelRoot = join(serverRoot, 'channels', dirName)
  const optsHash = optionsHash({ ...toggles, update: settings.updateMode })

  emit({ jobId, phase: 'channels', fraction: 0, current: 1, total: 1, detail: dmName })

  let messageCount = 0
  let mediaCount = 0
  try {
    const result = await exportConversation(client, settings.dmId, channelRoot, {
      kind: 'channel',
      name: dmName,
      toggles,
      updateMode: settings.updateMode,
      optsHash,
      assetsPath: '../../assets',
      serverHref: '../../index.html'
    })
    messageCount = result.messageCount
    mediaCount = result.mediaCount
    logBus.success(`Exported DM ${dmName} (${messageCount} messages)`)
  } catch (err) {
    // Leave any earlier index.html / metadata.json for this DM untouched.
    if (job.cancelled) return finalize(jobId, job, settings, serverRoot, dmName)
    logBus.error(`Failed to export DM: ${(err as Error).message}`)
    emit({ jobId, phase: 'error', fraction: null, done: true, error: 'Failed to export DM' })
    return
  }

  const exportedAt = new Date().toISOString()
  await fs.writeFile(
    join(serverRoot, 'metadata.json'),
    JSON.stringify({ serverName: dmName, serverId: settings.dmId, exportedAt, totalMessages: messageCount, totalMedia: mediaCount }, null, 2),
    'utf8'
  )
  await writeServerIndex(serverRoot, {
    serverName: dmName,
    serverId: settings.dmId,
    exportedAt,
    channels: [{ name: dmName, dirName, messageCount, mediaCount }],
    threads: [],
    totalMessages: messageCount,
    totalMedia: mediaCount
  })

  await finalize(jobId, job, settings, serverRoot, dmName)
}

// ---------------------------------------------------------------------------
// Export a single conversation (channel, thread, or DM)
// ---------------------------------------------------------------------------

interface ConversationOpts {
  kind: 'channel' | 'thread'
  name: string
  topic?: string
  parentName?: string
  parentHref?: string
  toggles: MediaToggles
  updateMode: boolean
  optsHash: string
  assetsPath: string
  serverHref: string
  roleFilter?: RoleFilter
  /** Forum/media channel: no messages of its own, only the landing page. */
  threadOnly?: boolean
}

/** Thrown when a conversation is interrupted, so no partial data is written. */
function throwIfCancelled(client: DiscordClient): void {
  if (client.cancelled()) throw new DiscordError('Export cancelled', 0)
}

async function exportConversation(
  client: DiscordClient,
  channelId: string,
  channelRoot: string,
  opts: ConversationOpts
): Promise<{ messageCount: number; mediaCount: number }> {
  await createChannelDirs(channelRoot)

  // Update mode: skip fully if options unchanged and we only want existing data?
  // We always check for new messages, but reuse media when the manifest matches.
  let existing: ExportMessage[] = []
  let afterMessageId: string | undefined
  if (opts.updateMode) {
    const manifest = await readManifest(channelRoot)
    existing = await readExistingMessages(channelRoot)
    if (existing.length > 0) {
      afterMessageId = existing[existing.length - 1].id
      logBus.info(`Update mode: ${existing.length} existing messages in ${opts.name}`)
    }
    if (manifest && manifest.optionsHash !== opts.optsHash) {
      logBus.info(`Options changed for ${opts.name}; re-fetching media as needed`)
    }
  }

  const media = new MediaDownloader(client, channelRoot, opts.toggles, logBus)

  let rawNew: RawMessage[] = []
  if (!opts.threadOnly) {
    logBus.info(`Fetching messages from ${opts.kind === 'thread' ? '🧵 ' : '#'}${opts.name}`)
    rawNew = await fetchAllMessages(client, channelId, {
      afterMessageId,
      onPage: (n) => {
        if (n % 500 === 0) logBus.info(`  …${n} messages from ${opts.name}`)
      }
    })
    // A cancelled fetch returns only the newest pages. Writing them would record
    // their last id in the manifest and update mode would never fetch the rest.
    throwIfCancelled(client)
  }

  // Role filter: keep only messages whose author currently holds a selected role.
  // (Update mode: messages already on disk were filtered at their original export;
  // only newly fetched messages are filtered here.)
  const rawKept = opts.roleFilter ? await opts.roleFilter.filter(rawNew) : rawNew

  // Pinned (for flagging).
  const pinnedIds = new Set<string>()
  if (rawKept.length > 0) {
    try {
      const pins = await fetchPinned(client, channelId)
      for (const p of pins) pinnedIds.add(p.id)
    } catch {
      /* ignore */
    }
  }
  for (const m of rawKept) {
    if (pinnedIds.has(m.id)) m.pinned = true
  }

  // Normalize new messages (downloads media per toggles).
  const normalizedNew: ExportMessage[] = []
  for (const raw of rawKept) {
    if (client.cancelled()) break
    try {
      normalizedNew.push(await normalizeMessage(raw, media))
    } catch (err) {
      logBus.warn(`Skipped a message in ${opts.name}: ${(err as Error).message}`)
    }
  }
  throwIfCancelled(client)

  // Merge with existing (update mode), dedupe by id, sort ascending.
  const byId = new Map<string, ExportMessage>()
  for (const m of existing) byId.set(m.id, m)
  for (const m of normalizedNew) byId.set(m.id, m)
  const messages = [...byId.values()].sort((a, b) => snowflakeCompare(a.id, b.id))

  const exportedAt = new Date().toISOString()
  const mediaCount = countMedia(messages)

  // messages.json
  await writeMessagesJson(channelRoot, {
    channelId,
    channelName: opts.name,
    parentChannelName: opts.parentName,
    exportedAt,
    messageCount: messages.length,
    messages
  })

  // messages.html transcript (when messages are included).
  if (opts.toggles.includeMessages) {
    await writeMessagesHtml(channelRoot, messages, {
      channelName: opts.name,
      channelId,
      messageCount: messages.length,
      assetsPath: opts.assetsPath,
      backHref: 'index.html'
    })
  }

  // index.html landing page.
  await writeChannelIndex(channelRoot, {
    kind: opts.kind,
    name: opts.name,
    id: channelId,
    topic: opts.topic,
    messageCount: messages.length,
    mediaCount,
    exportedAt,
    assetsPath: opts.assetsPath,
    serverHref: opts.serverHref,
    parentName: opts.parentName,
    parentHref: opts.parentHref
  })

  // Manifest checkpoint.
  await writeManifest(channelRoot, {
    channelId,
    channelName: opts.name,
    lastMessageId: messages.length ? messages[messages.length - 1].id : undefined,
    messageCount: messages.length,
    optionsHash: opts.optsHash,
    phase: 'complete',
    exportedAt
  })

  return { messageCount: messages.length, mediaCount }
}

// ---------------------------------------------------------------------------
// Finalize: optional ZIP + completion event
// ---------------------------------------------------------------------------

async function finalize(
  jobId: string,
  job: Job,
  settings: ExportSettings,
  serverRoot: string,
  name: string
): Promise<void> {
  exportOutputs.add(resolve(serverRoot))
  if (job.cancelled) {
    logBus.warn('Export cancelled')
    emit({ jobId, phase: 'cancelled', fraction: null, done: true, cancelled: true, outputPath: serverRoot })
    return
  }

  let zipPath: string | undefined
  if (settings.createZip) {
    emit({ jobId, phase: 'zipping', fraction: null, detail: 'Creating ZIP…' })
    logBus.info('Creating ZIP archive…')
    try {
      const folderName = sanitizeName(name, 'backup')
      zipPath = await createZip(serverRoot, `${serverRoot}.zip`, folderName)
      exportOutputs.add(resolve(zipPath))
      logBus.success(`ZIP created: ${zipPath}`)
    } catch (err) {
      logBus.error(`ZIP failed: ${(err as Error).message}`)
    }
  }

  logBus.success(`Export complete: ${serverRoot}`)
  emit({
    jobId,
    phase: 'done',
    fraction: 1,
    done: true,
    outputPath: serverRoot,
    zipPath
  })
}

// ---------------------------------------------------------------------------
// Server index helpers
// ---------------------------------------------------------------------------

async function readPreviousMetadata(
  serverRoot: string
): Promise<{ channels?: IndexChannelEntry[]; threads?: IndexThreadEntry[] }> {
  try {
    const parsed = JSON.parse(await fs.readFile(join(serverRoot, 'metadata.json'), 'utf8'))
    return {
      channels: Array.isArray(parsed.channels) ? parsed.channels : undefined,
      threads: Array.isArray(parsed.threads) ? parsed.threads : undefined
    }
  } catch {
    return {}
  }
}

/** This run's entries plus earlier ones it did not re-export whose folder still exists. */
async function mergeEntries<T extends { dirName: string }>(
  serverRoot: string,
  sub: 'channels' | 'threads',
  previous: T[] | undefined,
  current: T[]
): Promise<T[]> {
  const merged = [...current]
  const seen = new Set(current.map((e) => e.dirName))
  for (const e of previous ?? []) {
    if (typeof e?.dirName !== 'string' || seen.has(e.dirName)) continue
    const exists = await fs
      .stat(join(serverRoot, sub, e.dirName))
      .then((s) => s.isDirectory())
      .catch(() => false)
    if (exists) {
      seen.add(e.dirName)
      merged.push(e)
    }
  }
  return merged
}

function sum<T>(items: T[], key: keyof T): number {
  return items.reduce((n, item) => n + (Number(item[key]) || 0), 0)
}
