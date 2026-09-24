import { DiscordClient } from './client'
import type { RawMessage } from './endpoints'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface FetchOptions {
  /** Stop once we reach a message id we already have (update mode floor). */
  afterMessageId?: string
  /** Called after each page so callers can report progress. */
  onPage?: (totalSoFar: number) => void
}

/**
 * Fetch all messages from a channel/thread/DM, oldest-first.
 *
 *  - Full fetch walks backwards with `before=<lastId>` (Discord returns DESC),
 *    then we reverse to ascending order.
 *  - Update mode passes `afterMessageId`; we walk forwards with `after=<id>`.
 */
export async function fetchAllMessages(
  client: DiscordClient,
  channelId: string,
  opts: FetchOptions = {}
): Promise<RawMessage[]> {
  if (opts.afterMessageId) {
    return fetchAfter(client, channelId, opts.afterMessageId, opts.onPage)
  }
  return fetchBefore(client, channelId, opts.onPage)
}

async function fetchBefore(
  client: DiscordClient,
  channelId: string,
  onPage?: (n: number) => void
): Promise<RawMessage[]> {
  const collected: RawMessage[] = []
  let before: string | undefined

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (client.cancelled()) break
    const params: Record<string, string | number> = { limit: 100 }
    if (before) params.before = before
    const page = await client.get<RawMessage[]>(`/channels/${channelId}/messages`, params)
    if (!page || page.length === 0) break
    collected.push(...page)
    onPage?.(collected.length)
    before = page[page.length - 1].id
    if (page.length < 100) break
    await sleep(400)
  }

  // Discord returns newest-first; we want oldest-first.
  collected.reverse()
  return collected
}

async function fetchAfter(
  client: DiscordClient,
  channelId: string,
  afterId: string,
  onPage?: (n: number) => void
): Promise<RawMessage[]> {
  const collected: RawMessage[] = []
  let after = afterId

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (client.cancelled()) break
    // `after` returns ASC order, oldest of the newer messages first.
    const page = await client.get<RawMessage[]>(`/channels/${channelId}/messages`, {
      limit: 100,
      after
    })
    if (!page || page.length === 0) break
    // API returns newest-first even with `after`; sort ascending by snowflake.
    const sorted = [...page].sort((a, b) => snowflakeCompare(a.id, b.id))
    collected.push(...sorted)
    onPage?.(collected.length)
    after = sorted[sorted.length - 1].id
    if (page.length < 100) break
    await sleep(400)
  }

  return collected
}

/** Fetch pinned messages (single call, no pagination). */
export async function fetchPinned(
  client: DiscordClient,
  channelId: string
): Promise<RawMessage[]> {
  try {
    const pins = await client.get<RawMessage[]>(`/channels/${channelId}/pins`)
    return [...pins].sort((a, b) => snowflakeCompare(a.id, b.id))
  } catch {
    return []
  }
}

/** Compare two snowflake ids as big integers (chronological order). */
export function snowflakeCompare(a: string, b: string): number {
  const ba = BigInt(a)
  const bb = BigInt(b)
  return ba < bb ? -1 : ba > bb ? 1 : 0
}

/**
 * Merge existing + newly fetched messages, dedupe by id, sort ascending.
 * Used by update mode.
 */
export function mergeMessages(existing: RawMessage[], fresh: RawMessage[]): RawMessage[] {
  const byId = new Map<string, RawMessage>()
  for (const m of existing) byId.set(m.id, m)
  for (const m of fresh) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => snowflakeCompare(a.id, b.id))
}
