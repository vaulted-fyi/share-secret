import * as core from '@actions/core'
import {
  generateKey,
  exportKey,
  encrypt,
  wrapKeyWithPassphrase,
} from '@vaulted/crypto'
import { vaultedFetch } from './http.js'

const API_HOST = 'https://vaulted.fyi'

const EXPIRES_MAP: Record<string, number> = {
  '1h': 3600,
  '24h': 86400,
  '7d': 604800,
  '30d': 2592000,
}

interface CreateOptions {
  secret: string
  views: number
  expires: string
  passphrase?: string
}

export async function createSecret(opts: CreateOptions): Promise<void> {
  const key = await generateKey()
  const { ciphertext, iv } = await encrypt(opts.secret, key)

  let fragment: string
  const hasPassphrase = Boolean(opts.passphrase)

  if (opts.passphrase) {
    const { wrappedKey, salt } = await wrapKeyWithPassphrase(key, opts.passphrase)
    fragment = `${wrappedKey}.${salt}`
  } else {
    fragment = await exportKey(key)
  }

  const ttl = EXPIRES_MAP[opts.expires]

  const response = await vaultedFetch(`${API_HOST}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ciphertext,
      iv,
      maxViews: opts.views,
      ttl,
      hasPassphrase,
    }),
  })

  const data = (await response.json()) as {
    id?: string
    error?: string
    message?: string
  }

  if (!response.ok) {
    throw new Error(
      data.message ?? `API error (${response.status}): ${data.error ?? 'unknown error'}`
    )
  }

  if (data.message) {
    core.notice(data.message)
  }

  const id = data.id as string
  const url = `${API_HOST}/s/${id}#${fragment}`

  core.setOutput('id', id)
  core.setOutput('url', url)
}
