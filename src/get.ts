import * as core from '@actions/core'
import {
  importKey,
  decrypt,
  unwrapKeyWithPassphrase,
} from '@vaulted/crypto'
import { vaultedFetch } from './http.js'

interface GetOptions {
  url: string
  passphrase?: string
}

export async function getSecret(opts: GetOptions): Promise<void> {
  const parsed = parseVaultedUrl(opts.url)

  const response = await vaultedFetch(`${parsed.origin}/api/secrets/${parsed.id}`)

  if (!response.ok) {
    const body = await readJsonSafe(response)
    if (body.message) {
      throw new Error(body.message)
    }
    if (response.status === 404) {
      throw new Error('Secret not found or already expired.')
    }
    throw new Error(`API error (${response.status}): ${body.error ?? 'unknown error'}`)
  }

  const data = (await response.json()) as {
    ciphertext: string
    iv: string
    hasPassphrase: boolean
    message?: string
  }

  if (data.message) {
    core.notice(data.message)
  }

  let key
  if (data.hasPassphrase) {
    if (!opts.passphrase) {
      throw new Error('Secret requires a passphrase. Provide the "passphrase" input.')
    }
    const [wrappedKey, salt] = parsed.fragment.split('.')
    key = await unwrapKeyWithPassphrase(wrappedKey, salt, opts.passphrase)
  } else {
    key = await importKey(parsed.fragment)
  }

  const plaintext = await decrypt(data.ciphertext, data.iv, key)

  core.setSecret(plaintext)

  for (const line of plaintext.split('\n')) {
    if (line.trim()) {
      core.setSecret(line.trim())
    }
  }

  core.setOutput('secret', plaintext)
}

async function readJsonSafe(
  response: Response
): Promise<{ error?: string; message?: string }> {
  try {
    return (await response.json()) as { error?: string; message?: string }
  } catch {
    return {}
  }
}

function parseVaultedUrl(url: string): { origin: string; id: string; fragment: string } {
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) {
    throw new Error('Invalid Vaulted URL. Expected: https://host/s/{id}#{key}')
  }

  const fragment = url.slice(hashIndex + 1)
  const urlWithoutFragment = url.slice(0, hashIndex)

  const match = urlWithoutFragment.match(/^(https?:\/\/[^/]+)\/s\/([^/]+)$/)
  if (!match) {
    throw new Error('Invalid Vaulted URL. Expected: https://host/s/{id}#{key}')
  }

  return { origin: match[1], id: match[2], fragment }
}
