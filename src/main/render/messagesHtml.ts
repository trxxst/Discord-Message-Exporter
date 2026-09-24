import { promises as fs } from 'fs'
import { join } from 'path'
import { page, topBar, escapeHtml } from './html'
import type { ExportMessage } from './normalize'

export interface TranscriptMeta {
  channelName: string
  channelId: string
  messageCount: number
  /** Relative path to assets/, e.g. "../../assets". */
  assetsPath: string
  /** Relative crumb back to the channel index. */
  backHref: string
}

/**
 * Render the chat-style transcript. Messages are embedded as
 * window.__CHANNEL_DATA__ and rendered by the viewer app.js.
 */
export async function writeMessagesHtml(
  channelRoot: string,
  messages: ExportMessage[],
  meta: TranscriptMeta
): Promise<void> {
  const crumbs = `<a href="${meta.backHref}">← ${escapeHtml(meta.channelName)}</a>`
  const body = `${topBar(`#${escapeHtml(meta.channelName)}`, crumbs)}
<div class="wrap">
  <div class="count-note">${meta.messageCount.toLocaleString()} messages</div>
  <div id="countNote" class="count-note"></div>
  <div id="feed"></div>
</div>`

  const html = page({
    title: `#${meta.channelName} - transcript`,
    assetsPath: meta.assetsPath,
    body,
    embed: {
      varName: '__CHANNEL_DATA__',
      data: { channelId: meta.channelId, channelName: meta.channelName, messages }
    }
  })

  await fs.writeFile(join(channelRoot, 'messages.html'), html, 'utf8')
}
