import { promises as fs } from 'fs'
import { join } from 'path'
import type { ExportMessage } from './normalize'

export interface MessagesJson {
  channelId: string
  channelName: string
  parentChannelName?: string
  exportedAt: string
  messageCount: number
  messages: ExportMessage[]
}

/** Write messages.json in the structure described by goal.txt. */
export async function writeMessagesJson(
  channelRoot: string,
  data: MessagesJson
): Promise<void> {
  await fs.writeFile(join(channelRoot, 'messages.json'), JSON.stringify(data, null, 2), 'utf8')
}
