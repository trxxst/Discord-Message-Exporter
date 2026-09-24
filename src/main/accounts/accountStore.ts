import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ConnectedAccount } from '../../shared/types'

interface StoredAccount extends ConnectedAccount {
  /** base64 of safeStorage-encrypted token, or plaintext fallback. */
  tokenEnc: string
  /** true when encryption was unavailable and token is stored as plaintext base64. */
  tokenPlain?: boolean
}

interface StoreFile {
  version: 1
  accounts: StoredAccount[]
}

function storePath(): string {
  return join(app.getPath('userData'), 'accounts.json')
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoreFile
    if (!parsed.accounts) return { version: 1, accounts: [] }
    return parsed
  } catch {
    return { version: 1, accounts: [] }
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8')
}

function encryptToken(token: string): { tokenEnc: string; tokenPlain: boolean } {
  if (safeStorage.isEncryptionAvailable()) {
    return { tokenEnc: safeStorage.encryptString(token).toString('base64'), tokenPlain: false }
  }
  // Fallback when OS keychain is unavailable: store base64 (not secure, but functional).
  return { tokenEnc: Buffer.from(token, 'utf8').toString('base64'), tokenPlain: true }
}

function decryptToken(stored: StoredAccount): string {
  const buf = Buffer.from(stored.tokenEnc, 'base64')
  if (stored.tokenPlain) return buf.toString('utf8')
  return safeStorage.decryptString(buf)
}

function toPublic(a: StoredAccount): ConnectedAccount {
  const { tokenEnc: _t, tokenPlain: _p, ...pub } = a
  return pub
}

export const accountStore = {
  async list(): Promise<ConnectedAccount[]> {
    const store = await readStore()
    return store.accounts.map(toPublic)
  },

  async getToken(id: string): Promise<{ token: string; isBot: boolean } | null> {
    const store = await readStore()
    const acc = store.accounts.find((a) => a.id === id)
    if (!acc) return null
    try {
      return { token: decryptToken(acc), isBot: acc.isBot }
    } catch {
      return null
    }
  },

  async upsert(
    partial: Omit<ConnectedAccount, 'id' | 'createdAt'> & { id?: string },
    token?: string
  ): Promise<ConnectedAccount> {
    const store = await readStore()
    const existingIdx = partial.id ? store.accounts.findIndex((a) => a.id === partial.id) : -1

    if (existingIdx >= 0) {
      const prev = store.accounts[existingIdx]
      const enc = token ? encryptToken(token) : { tokenEnc: prev.tokenEnc, tokenPlain: prev.tokenPlain }
      const updated: StoredAccount = {
        ...prev,
        ...partial,
        id: prev.id,
        createdAt: prev.createdAt,
        tokenEnc: enc.tokenEnc,
        tokenPlain: enc.tokenPlain
      }
      store.accounts[existingIdx] = updated
      await writeStore(store)
      return toPublic(updated)
    }

    const enc = encryptToken(token ?? '')
    const created: StoredAccount = {
      ...partial,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      tokenEnc: enc.tokenEnc,
      tokenPlain: enc.tokenPlain
    }
    store.accounts.push(created)
    await writeStore(store)
    return toPublic(created)
  },

  async rename(id: string, label: string): Promise<boolean> {
    const store = await readStore()
    const acc = store.accounts.find((a) => a.id === id)
    if (!acc) return false
    acc.label = label
    await writeStore(store)
    return true
  },

  async setStatus(id: string, status: ConnectedAccount['status']): Promise<void> {
    const store = await readStore()
    const acc = store.accounts.find((a) => a.id === id)
    if (!acc) return
    acc.status = status
    acc.lastConnectedAt = status === 'connected' ? new Date().toISOString() : acc.lastConnectedAt
    await writeStore(store)
  },

  async remove(id: string): Promise<boolean> {
    const store = await readStore()
    const before = store.accounts.length
    store.accounts = store.accounts.filter((a) => a.id !== id)
    await writeStore(store)
    return store.accounts.length < before
  }
}
