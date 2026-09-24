import { DiscordClient } from '../discord/client'
import { endpoints } from '../discord/endpoints'
import type { RawMessage } from '../discord/endpoints'
import type { Logger } from '../log/bus'

/**
 * Restricts an export to messages whose author currently holds one of the
 * selected roles (any-of). Membership is resolved live per author via a
 * single-member lookup and cached, so each unique author is checked once.
 *
 * When an author's roles can't be confirmed (left the server, webhook/system
 * author, or the lookup is forbidden), `includeOnUncertain` decides whether the
 * message is kept, and a warning is logged once per author.
 */
export class RoleFilter {
  private client: DiscordClient
  private guildId: string
  private roleIds: Set<string>
  private includeOnUncertain: boolean
  private logger: Logger
  /** userId -> whether their messages are kept. */
  private cache = new Map<string, boolean>()

  constructor(
    client: DiscordClient,
    guildId: string,
    roleIds: Set<string>,
    includeOnUncertain: boolean,
    logger: Logger
  ) {
    this.client = client
    this.guildId = guildId
    this.roleIds = roleIds
    this.includeOnUncertain = includeOnUncertain
    this.logger = logger
  }

  /** Whether messages from this user should be kept. Cached per user id. */
  async allows(userId: string, username?: string): Promise<boolean> {
    const cached = this.cache.get(userId)
    if (cached !== undefined) return cached

    let result: boolean
    try {
      const member = await endpoints.member(this.client, this.guildId, userId)
      if (!member) {
        this.logger.warn(
          `Could not confirm roles for ${username ?? userId} (not a current member) - ${
            this.includeOnUncertain ? 'including' : 'excluding'
          }`
        )
        result = this.includeOnUncertain
      } else {
        result = member.roles.some((r) => this.roleIds.has(r))
      }
    } catch (err) {
      this.logger.warn(
        `Role lookup failed for ${username ?? userId}: ${(err as Error).message} - ${
          this.includeOnUncertain ? 'including' : 'excluding'
        }`
      )
      result = this.includeOnUncertain
    }

    this.cache.set(userId, result)
    return result
  }

  /** Keep only messages whose author passes the role check. */
  async filter(messages: RawMessage[]): Promise<RawMessage[]> {
    if (messages.length === 0) return messages
    const kept: RawMessage[] = []
    for (const m of messages) {
      if (this.client.cancelled()) {
        kept.push(m) // stop filtering work on cancel; remaining handled upstream
        continue
      }
      if (await this.allows(m.author.id, m.author.username)) {
        kept.push(m)
      }
    }
    const removed = messages.length - kept.length
    if (removed > 0) {
      this.logger.info(`Filtered out ${removed}/${messages.length} messages not matching role(s)`)
    }
    return kept
  }
}
