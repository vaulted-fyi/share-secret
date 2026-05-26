export const USER_AGENT = 'vaulted-share-secret-action/1.0.0'

export function vaultedFetch(
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('User-Agent', USER_AGENT)
  return fetch(input, { ...init, headers })
}
