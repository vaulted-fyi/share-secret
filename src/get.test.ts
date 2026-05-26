import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateKey,
  exportKey,
  encrypt,
  wrapKeyWithPassphrase,
} from '@vaulted/crypto'
import { getSecret } from './get.js'
import { USER_AGENT } from './http.js'

const mockSetOutput = vi.fn()
const mockSetSecret = vi.fn()
const mockNotice = vi.fn()
vi.mock('@actions/core', () => ({
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setSecret: (...args: unknown[]) => mockSetSecret(...args),
  notice: (...args: unknown[]) => mockNotice(...args),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

function headerValue(init: RequestInit | undefined, name: string): string | null {
  const headers = new Headers(init?.headers)
  return headers.get(name)
}

describe('getSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches, decrypts, masks, and outputs the secret', async () => {
    const key = await generateKey()
    const keyStr = await exportKey(key)
    const { ciphertext, iv } = await encrypt('my-secret-value', key)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ciphertext,
        iv,
        hasPassphrase: false,
        viewsRemaining: 2,
      }),
    })

    await getSecret({
      url: `https://vaulted.fyi/s/abc123#${keyStr}`,
    })

    const [fetchUrl] = mockFetch.mock.calls[0]
    expect(fetchUrl).toBe('https://vaulted.fyi/api/secrets/abc123')

    const secretCallOrder = mockSetSecret.mock.invocationCallOrder[0]
    const outputCallOrder = mockSetOutput.mock.invocationCallOrder[0]
    expect(secretCallOrder).toBeLessThan(outputCallOrder)

    expect(mockSetSecret).toHaveBeenCalledWith('my-secret-value')
    expect(mockSetOutput).toHaveBeenCalledWith('secret', 'my-secret-value')
  })

  it('sends a User-Agent header on every request', async () => {
    const key = await generateKey()
    const keyStr = await exportKey(key)
    const { ciphertext, iv } = await encrypt('x', key)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ciphertext, iv, hasPassphrase: false }),
    })

    await getSecret({ url: `https://vaulted.fyi/s/ua#${keyStr}` })

    const [, fetchOpts] = mockFetch.mock.calls[0]
    expect(headerValue(fetchOpts, 'User-Agent')).toBe(USER_AGENT)
  })

  it('masks each line of multi-line secrets individually', async () => {
    const multiLine = 'line-one\nline-two\nline-three'
    const key = await generateKey()
    const keyStr = await exportKey(key)
    const { ciphertext, iv } = await encrypt(multiLine, key)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ciphertext,
        iv,
        hasPassphrase: false,
        viewsRemaining: 1,
      }),
    })

    await getSecret({
      url: `https://vaulted.fyi/s/multi#${keyStr}`,
    })

    expect(mockSetSecret).toHaveBeenCalledWith(multiLine)
    expect(mockSetSecret).toHaveBeenCalledWith('line-one')
    expect(mockSetSecret).toHaveBeenCalledWith('line-two')
    expect(mockSetSecret).toHaveBeenCalledWith('line-three')
  })

  it('decrypts passphrase-protected secrets', async () => {
    const key = await generateKey()
    const { ciphertext, iv } = await encrypt('protected-secret', key)
    const { wrappedKey, salt } = await wrapKeyWithPassphrase(key, 'pass123')

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ciphertext,
        iv,
        hasPassphrase: true,
        viewsRemaining: 0,
      }),
    })

    await getSecret({
      url: `https://vaulted.fyi/s/xyz789#${wrappedKey}.${salt}`,
      passphrase: 'pass123',
    })

    expect(mockSetSecret).toHaveBeenCalledWith('protected-secret')
    expect(mockSetOutput).toHaveBeenCalledWith('secret', 'protected-secret')
  })

  it('throws when passphrase required but not provided', async () => {
    const key = await generateKey()
    const { ciphertext, iv } = await encrypt('secret', key)
    const { wrappedKey, salt } = await wrapKeyWithPassphrase(key, 'pass')

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ciphertext,
        iv,
        hasPassphrase: true,
        viewsRemaining: 1,
      }),
    })

    await expect(
      getSecret({
        url: `https://vaulted.fyi/s/test#${wrappedKey}.${salt}`,
      })
    ).rejects.toThrow('passphrase')
  })

  it('throws on 404 with default message when server returns no message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    })

    await expect(
      getSecret({ url: 'https://vaulted.fyi/s/gone#key' })
    ).rejects.toThrow('Secret not found or already expired')
  })

  it('surfaces server message verbatim on error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({
        error: 'revoked',
        message: 'This secret was revoked by the sender.',
      }),
    })

    await expect(
      getSecret({ url: 'https://vaulted.fyi/s/revoked#key' })
    ).rejects.toThrow('This secret was revoked by the sender.')
  })

  it('emits a notice when the server attaches a message to a successful response', async () => {
    const key = await generateKey()
    const keyStr = await exportKey(key)
    const { ciphertext, iv } = await encrypt('value', key)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ciphertext,
        iv,
        hasPassphrase: false,
        message: 'Action v1 is deprecated. Upgrade to v2.',
      }),
    })

    await getSecret({ url: `https://vaulted.fyi/s/notice#${keyStr}` })

    expect(mockNotice).toHaveBeenCalledWith('Action v1 is deprecated. Upgrade to v2.')
  })

  it('throws on invalid URL format', async () => {
    await expect(
      getSecret({ url: 'https://example.com/not-valid' })
    ).rejects.toThrow('Invalid Vaulted URL')
  })
})
