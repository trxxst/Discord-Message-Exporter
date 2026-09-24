import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'
import { accountStore } from './accounts/accountStore'
import { DiscordClient } from './discord/client'
import { endpoints, displayName, avatarUrl } from './discord/endpoints'
import { startExport, cancelJob, isExportOutput } from './export/engine'
import { logBus } from './log/bus'
import type {
  AddAccountResult,
  SimpleResult,
  ExportSettings,
  ConnectedAccount
} from '../shared/types'

async function clientFor(accountId: string): Promise<DiscordClient | null> {
  const creds = await accountStore.getToken(accountId)
  if (!creds) return null
  return new DiscordClient({ token: creds.token, isBot: creds.isBot, logger: logBus })
}

export function registerIpc(): void {
  // ---- Accounts ----
  ipcMain.handle(IPC.accounts.list, () => accountStore.list())

  ipcMain.handle(
    IPC.accounts.add,
    async (_e, token: string, isBot: boolean): Promise<AddAccountResult> => {
      const trimmed = (token ?? '').trim()
      if (!trimmed) return { ok: false, error: 'Token is empty' }
      const client = new DiscordClient({ token: trimmed, isBot, logger: logBus })
      try {
        const me = await endpoints.me(client)
        const account = await accountStore.upsert(
          {
            username: displayName(me),
            discriminator: me.discriminator,
            avatarUrl: avatarUrl(me),
            authType: isBot ? 'bot' : 'user',
            isBot,
            status: 'connected',
            lastConnectedAt: new Date().toISOString()
          },
          trimmed
        )
        logBus.success(`Connected as ${account.username}`)
        return { ok: true, account }
      } catch (err) {
        const msg = (err as Error).message || 'Validation failed'
        logBus.error(`Failed to add account: ${msg}`)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(IPC.accounts.remove, async (_e, id: string): Promise<SimpleResult> => {
    const ok = await accountStore.remove(id)
    return { ok }
  })

  ipcMain.handle(
    IPC.accounts.rename,
    async (_e, id: string, label: string): Promise<SimpleResult> => {
      const ok = await accountStore.rename(id, label)
      return { ok }
    }
  )

  ipcMain.handle(IPC.accounts.refresh, async (_e, id: string): Promise<AddAccountResult> => {
    const client = await clientFor(id)
    if (!client) return { ok: false, error: 'Account not found' }
    try {
      const me = await endpoints.me(client)
      const account = await accountStore.upsert({
        id,
        username: displayName(me),
        discriminator: me.discriminator,
        avatarUrl: avatarUrl(me),
        authType: client.botMode ? 'bot' : 'user',
        isBot: client.botMode,
        status: 'connected',
        lastConnectedAt: new Date().toISOString()
      })
      return { ok: true, account }
    } catch (err) {
      await accountStore.setStatus(id, 'invalid')
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- Discord data ----
  ipcMain.handle(IPC.discord.getGuilds, async (_e, accountId: string) => {
    const client = await clientFor(accountId)
    if (!client) return []
    try {
      return await endpoints.guilds(client)
    } catch (err) {
      logBus.error(`Failed to load servers: ${(err as Error).message}`)
      return []
    }
  })

  ipcMain.handle(IPC.discord.getChannels, async (_e, accountId: string, guildId: string) => {
    const client = await clientFor(accountId)
    if (!client) return []
    try {
      return await endpoints.channels(client, guildId)
    } catch (err) {
      logBus.error(`Failed to load channels: ${(err as Error).message}`)
      return []
    }
  })

  ipcMain.handle(IPC.discord.getThreads, async (_e, accountId: string, channelId: string) => {
    const client = await clientFor(accountId)
    if (!client) return []
    try {
      const channel = await endpoints.rawChannel(client, channelId)
      const active = channel.guild_id
        ? await endpoints.activeGuildThreads(client, channel.guild_id).catch(() => [])
        : []
      return await endpoints.threads(client, channelId, active)
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.discord.getDMs, async (_e, accountId: string) => {
    const client = await clientFor(accountId)
    if (!client) return []
    try {
      return await endpoints.dms(client)
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.discord.getRoles, async (_e, accountId: string, guildId: string) => {
    const client = await clientFor(accountId)
    if (!client) return []
    try {
      return await endpoints.roles(client, guildId)
    } catch (err) {
      logBus.error(`Failed to load roles: ${(err as Error).message}`)
      return []
    }
  })

  // ---- Export ----
  ipcMain.handle(IPC.exporter.start, async (_e, settings: ExportSettings) => {
    const creds = await accountStore.getToken(settings.accountId)
    if (!creds) {
      logBus.error('Cannot start export: account not found')
      return { jobId: '' }
    }
    const jobId = startExport(settings, creds.token, creds.isBot)
    return { jobId }
  })

  ipcMain.handle(IPC.exporter.cancel, async (_e, jobId: string): Promise<SimpleResult> => {
    const ok = cancelJob(jobId)
    return { ok }
  })

  // ---- Dialog / shell ----
  ipcMain.handle(IPC.dialog.pickOutputFolder, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Only open what an export produced: shell.openPath also launches executables,
  // so an arbitrary renderer-supplied path must not reach it.
  ipcMain.handle(IPC.dialog.openPath, async (_e, path: string) => {
    if (!isExportOutput(path)) return
    await shell.openPath(path)
  })
}

// Re-export for type completeness elsewhere if needed.
export type { ConnectedAccount }
