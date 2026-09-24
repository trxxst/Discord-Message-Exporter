import { promises as fs } from 'fs'
import { join } from 'path'
import { page, topBar, escapeHtml, fmtDate } from './html'

export interface ChannelIndexMeta {
  kind: 'channel' | 'thread'
  name: string
  id: string
  topic?: string
  messageCount: number
  mediaCount: number
  exportedAt: string
  /** Relative path to assets/, e.g. "../../assets". */
  assetsPath: string
  /** Relative link back to the server index, e.g. "../../index.html". */
  serverHref: string
  /** For threads: relative link to the parent channel index. */
  parentName?: string
  parentHref?: string
}

/** Write the per-channel or per-thread index.html landing page. */
export async function writeChannelIndex(
  channelRoot: string,
  meta: ChannelIndexMeta
): Promise<void> {
  const label = meta.kind === 'thread' ? '🧵 ' : '#'
  const crumbs = [
    `<a href="${meta.serverHref}">← Server</a>`,
    meta.parentHref ? `<a href="${meta.parentHref}">#${escapeHtml(meta.parentName ?? '')}</a>` : ''
  ]
    .filter(Boolean)
    .join(' · ')

  const stats = [
    stat(meta.messageCount.toLocaleString(), 'Messages'),
    stat(meta.mediaCount.toLocaleString(), 'Media files'),
    stat(fmtDate(meta.exportedAt), 'Exported')
  ].join('')

  const body = `${topBar(`${label}${escapeHtml(meta.name)}`, crumbs, false)}
<div class="wrap">
  <div class="card">
    <div class="meta-grid">${stats}</div>
  </div>
  <div class="card">
    <div class="section-title">Details</div>
    <p><span class="hash">ID:</span> ${escapeHtml(meta.id)}</p>
    ${meta.kind === 'thread' && meta.parentName ? `<p><span class="hash">Parent:</span> #${escapeHtml(meta.parentName)}</p>` : ''}
    ${meta.topic ? `<p><span class="hash">Topic:</span> ${escapeHtml(meta.topic)}</p>` : ''}
  </div>
  <div class="card">
    <div class="section-title">Open</div>
    <a class="list-link" href="messages.html"><span>💬 Message transcript</span><span class="badge">messages.html</span></a>
    <a class="list-link" href="messages.json"><span>🗂️ Structured data</span><span class="badge">messages.json</span></a>
    <a class="list-link" href="media/"><span>📁 Media folder</span><span class="badge">media/</span></a>
  </div>
</div>`

  const html = page({ title: `${meta.name} - ${meta.kind}`, assetsPath: meta.assetsPath, body })
  await fs.writeFile(join(channelRoot, 'index.html'), html, 'utf8')
}

function stat(n: string, label: string): string {
  return `<div class="stat"><div class="n">${escapeHtml(n)}</div><div class="l">${escapeHtml(label)}</div></div>`
}
