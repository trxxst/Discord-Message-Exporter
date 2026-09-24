import type { Logger } from '../log/bus'
import { version } from '../../../package.json'

export const DISCORD_API = 'https://discord.com/api/v10'

const USER_AGENT = `DiscordBackup (https://github.com/trxxst/Discord-Message-Exporter, ${version})`

export class DiscordError extends Error {
  status: number
  code?: number
  constructor(message: string, status: number, code?: number) {
    super(message)
    this.name = 'DiscordError'
    this.status = status
    this.code = code
  }
}

export interface ClientOptions {
  token: string
  isBot: boolean
  logger?: Logger
  /** Cooperative cancellation. When it returns true, in-flight loops abort. */
  isCancelled?: () => boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function authHeader(token: string, isBot: boolean): string {
  // The ONLY auth difference between a bot and a user token is the "Bot " prefix.
  return isBot ? `Bot ${token}` : token
}

/**
 * A thin Discord REST wrapper that honours rate limits and retries transient
 * failures with exponential backoff. Mirrors the proven Python v6 strategy.
 */
export class DiscordClient {
  private token: string
  private isBot: boolean
  private logger?: Logger
  private isCancelled?: () => boolean

  constructor(opts: ClientOptions) {
    this.token = opts.token
    this.isBot = opts.isBot
    this.logger = opts.logger
    this.isCancelled = opts.isCancelled
  }

  get botMode(): boolean {
    return this.isBot
  }

  private headers(): Record<string, string> {
    return {
      Authorization: authHeader(this.token, this.isBot),
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json'
    }
  }

  cancelled(): boolean {
    return this.isCancelled ? this.isCancelled() : false
  }

  /** GET a Discord API path (relative to /api/v10) returning parsed JSON. */
  async get<T = unknown>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${DISCORD_API}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    }
    const res = await this.request(url.toString())
    return (await res.json()) as T
  }

  /** Fetch a raw binary resource (media). Returns null on a hard failure. */
  async getBuffer(url: string): Promise<{ buffer: Buffer; contentType: string | null } | null> {
    try {
      const res = await this.request(url, { auth: false, maxRetries: 3 })
      const arrayBuf = await res.arrayBuffer()
      return { buffer: Buffer.from(arrayBuf), contentType: res.headers.get('content-type') }
    } catch (err) {
      this.logger?.warn(`Media download failed: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * Core request with rate-limit + retry handling.
   *  - Honours X-RateLimit-Remaining == 0 by waiting Reset-After + buffer.
   *  - On HTTP 429 waits retry_after.
   *  - Retries network errors / 5xx with exponential backoff (max 5).
   */
  private async request(
    url: string,
    opts: { auth?: boolean; maxRetries?: number } = {}
  ): Promise<Response> {
    const auth = opts.auth !== false
    const maxRetries = opts.maxRetries ?? 5
    let attempt = 0

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.cancelled()) throw new DiscordError('Export cancelled', 0)
      attempt += 1
      try {
        const res = await fetch(url, {
          headers: auth ? this.headers() : { 'User-Agent': USER_AGENT }
        })

        if (res.status === 429) {
          let retryAfter = 1
          try {
            const body = (await res.clone().json()) as { retry_after?: number }
            if (typeof body.retry_after === 'number') retryAfter = body.retry_after
          } catch {
            const header = res.headers.get('retry-after')
            if (header) retryAfter = Number(header)
          }
          this.logger?.warn(`Rate limit reached, waiting ${retryAfter.toFixed(1)}s`)
          await sleep(retryAfter * 1000 + 500)
          continue
        }

        if (res.status >= 500 && res.status < 600) {
          if (attempt > maxRetries) {
            throw new DiscordError(`Server error ${res.status}`, res.status)
          }
          const wait = Math.min(2 ** (attempt - 1), 16)
          this.logger?.warn(`Discord ${res.status}, retrying in ${wait}s`)
          await sleep(wait * 1000)
          continue
        }

        if (!res.ok) {
          let code: number | undefined
          let message = `HTTP ${res.status}`
          try {
            const body = (await res.clone().json()) as { message?: string; code?: number }
            if (body.message) message = body.message
            code = body.code
          } catch {
            /* ignore */
          }
          throw new DiscordError(message, res.status, code)
        }

        // Pre-emptive throttle: if we just used the last token, pause.
        const remaining = res.headers.get('x-ratelimit-remaining')
        const resetAfter = res.headers.get('x-ratelimit-reset-after')
        if (remaining === '0' && resetAfter) {
          await sleep(Number(resetAfter) * 1000 + 500)
        }

        return res
      } catch (err) {
        if (err instanceof DiscordError) {
          // 4xx (other than 429) are not retryable.
          if (err.status >= 400 && err.status < 500) throw err
          if (err.status === 0) throw err // cancelled
        }
        if (attempt > maxRetries) throw err
        const wait = Math.min(2 ** (attempt - 1), 16)
        this.logger?.warn(`Network error, retrying in ${wait}s (${(err as Error).message})`)
        await sleep(wait * 1000)
      }
    }
  }
}
