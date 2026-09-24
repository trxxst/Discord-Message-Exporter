import { promises as fs } from 'fs'
import { join } from 'path'
import { page, topBar, escapeHtml, fmtDate } from './html'

export interface IndexChannelEntry {
  name: string
  dirName: string
  messageCount: number
  mediaCount: number
}

export interface IndexThreadEntry {
  name: string
  dirName: string
  parentName: string
  messageCount: number
  mediaCount: number
}

export interface ServerIndexData {
  serverName: string
  serverId: string
  iconRelPath?: string
  exportedAt: string
  channels: IndexChannelEntry[]
  threads: IndexThreadEntry[]
  totalMessages: number
  totalMedia: number
}

/** Write the server-level index.html homepage that links the whole archive. */
export async function writeServerIndex(serverRoot: string, data: ServerIndexData): Promise<void> {
  const icon = data.iconRelPath
    ? `<img src="${escapeHtml(data.iconRelPath)}" alt="" style="width:64px;height:64px;border-radius:16px;vertical-align:middle;margin-right:14px" />`
    : ''

  const stats = [
    stat(data.channels.length.toLocaleString(), 'Channels'),
    stat(data.threads.length.toLocaleString(), 'Threads'),
    stat(data.totalMessages.toLocaleString(), 'Messages'),
    stat(data.totalMedia.toLocaleString(), 'Media files'),
    stat(fmtDate(data.exportedAt), 'Exported')
  ].join('')

  const channelList =
    data.channels
      .map(
        (c) =>
          `<a class="list-link" data-name="${escapeHtml(c.name)}" href="channels/${encodeURIComponent(
            c.dirName
          )}/index.html"><span># ${escapeHtml(c.name)}</span><span class="badge">${c.messageCount.toLocaleString()} msgs · ${c.mediaCount.toLocaleString()} media</span></a>`
      )
      .join('\n') || '<div class="count-note">No channels exported.</div>'

  const threadList =
    data.threads
      .map(
        (t) =>
          `<a class="list-link" data-name="${escapeHtml(t.name)} ${escapeHtml(
            t.parentName
          )}" href="threads/${encodeURIComponent(
            t.dirName
          )}/index.html"><span>🧵 ${escapeHtml(t.name)} <span class="hash">in #${escapeHtml(
            t.parentName
          )}</span></span><span class="badge">${t.messageCount.toLocaleString()} msgs</span></a>`
      )
      .join('\n') || '<div class="count-note">No threads exported.</div>'

  const body = `${topBar(`${icon}${escapeHtml(data.serverName)}`)}
<div class="wrap">
  <div class="card"><div class="meta-grid">${stats}</div></div>
  <div class="card">
    <div class="section-title">Server</div>
    <p><span class="hash">ID:</span> ${escapeHtml(data.serverId)}</p>
    <p><a href="metadata.json">metadata.json</a></p>
  </div>
  <div class="section-title">Channels</div>
  ${channelList}
  <div class="section-title">Threads</div>
  ${threadList}
</div>`

  const html = page({
    title: `${data.serverName} - Backup`,
    assetsPath: 'assets',
    body,
    embed: { varName: '__SERVER_DATA__', data: { serverId: data.serverId } }
  })
  await fs.writeFile(join(serverRoot, 'index.html'), html, 'utf8')
}

function stat(n: string, label: string): string {
  return `<div class="stat"><div class="n">${escapeHtml(n)}</div><div class="l">${escapeHtml(label)}</div></div>`
}
