import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSecret } from './create.js'
import { USER_AGENT } from './http.js'

const mockSetOutput = vi.fn()
const mockSetFailed = vi.fn()
const mockNotice = vi.fn()
vi.mock('@actions/core', () => ({
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  notice: (...args: unknown[]) => mockNotice(...args),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

function headerValue(init: RequestInit | undefined, name: string): string | null {
  const headers = new Headers(init?.headers)
  return headers.get(name)
}

describe('createSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encrypts secret and posts to API, sets url and id outputs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'test-id-123' }),
    })

    await createSecret({
      secret: 'my-api-key',
      views: 1,
      expires: '24h',
    })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]
    expect(fetchUrl).toBe('https://vaulted.fyi/api/secrets')
    expect(fetchOpts.method).toBe('POST')

    const body = JSON.parse(fetchOpts.body)
    expect(body.ciphertext).toBeTruthy()
    expect(body.iv).toBeTruthy()
    expect(body.maxViews).toBe(1)
    expect(body.ttl).toBe(86400)
    expect(body.hasPassphrase).toBe(false)

    expect(mockSetOutput).toHaveBeenCalledWith('id', 'test-id-123')
    expect(mockSetOutput).toHaveBeenCalledWith(
      'url',
      expect.stringMatching(/^https:\/\/vaulted\.fyi\/s\/test-id-123#.+/)
    )
  })

  it('sends a User-Agent header on every request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ua-id' }),
    })

    await createSecret({ secret: 'x', views: 1, expires: '24h' })

    const [, fetchOpts] = mockFetch.mock.calls[0]
    expect(headerValue(fetchOpts, 'User-Agent')).toBe(USER_AGENT)
  })

  it('handles passphrase-protected secrets', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'pp-id' }),
    })

    await createSecret({
      secret: 'protected-secret',
      views: 3,
      expires: '1h',
      passphrase: 'hunter2',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.hasPassphrase).toBe(true)

    const urlCall = mockSetOutput.mock.calls.find((c: unknown[]) => c[0] === 'url')
    const fragment = (urlCall![1] as string).split('#')[1]
    expect(fragment).toContain('.')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limited' }),
    })

    await expect(
      createSecret({ secret: 'test', views: 1, expires: '24h' })
    ).rejects.toThrow('API error (429): Rate limited')
  })

  it('surfaces server message verbatim on error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'service_unavailable',
        message: 'Vaulted is down for maintenance until 18:00 UTC.',
      }),
    })

    await expect(
      createSecret({ secret: 'test', views: 1, expires: '24h' })
    ).rejects.toThrow('Vaulted is down for maintenance until 18:00 UTC.')
  })

  it('emits a notice when the server attaches a message to a successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'notice-id',
        message: 'Heads up: free tier limits will change next month.',
      }),
    })

    await createSecret({ secret: 'test', views: 1, expires: '24h' })

    expect(mockNotice).toHaveBeenCalledWith(
      'Heads up: free tier limits will change next month.'
    )
  })
})
