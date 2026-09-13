import type { UserRow } from './rows'
import { userForToken } from './users'

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

/** The teammate behind the extension's session token, or null when it's missing or revoked. */
export async function authenticate(request: Request): Promise<UserRow | null> {
  const token = bearerToken(request)
  return token ? userForToken(token) : null
}

export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 })
}
