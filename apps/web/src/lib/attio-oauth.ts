import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { AUTH_REDIRECT_PATH } from '@linkedin-sync/core'
import { attio } from './linking'

const STATE_TTL_MS = 10 * 60_000
/** Chrome's launchWebAuthFlow redirect for any extension id, and nothing else */
const EXTENSION_REDIRECT = new RegExp(`^https://[a-p]{32}\\.chromiumapp\\.org/${AUTH_REDIRECT_PATH}$`)

/**
 * Where this backend is reachable. Vercel exposes the production domain, so a deployment
 * only needs PUBLIC_BASE_URL for a custom domain or local development.
 */
export function publicBaseUrl(): string {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const url = process.env.PUBLIC_BASE_URL ?? (vercelDomain ? `https://${vercelDomain}` : null)
  if (!url) throw new Error('Set PUBLIC_BASE_URL to the URL this backend is served from')
  return url.replace(/\/+$/, '')
}

/** Must match the redirect URI registered on the Attio app exactly. */
function callbackUrl(): string {
  return `${publicBaseUrl()}/api/auth/attio/callback`
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function isExtensionRedirect(url: string): boolean {
  return EXTENSION_REDIRECT.test(url)
}

const sign = (payload: string) => createHmac('sha256', requireEnv('AUTH_SECRET')).update(payload).digest()

/** Signed so the callback can only ever send a token back to the extension that asked. */
export function signState(redirect: string): string {
  const payload = Buffer.from(
    JSON.stringify({ redirect, nonce: randomBytes(12).toString('base64url'), exp: Date.now() + STATE_TTL_MS }),
  ).toString('base64url')
  return `${payload}.${sign(payload).toString('base64url')}`
}

/** The extension redirect carried in a valid, unexpired state; null otherwise. */
export function verifyState(state: string): string | null {
  const [payload, signature] = state.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const { redirect, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { redirect: string; exp: number }
    return exp > Date.now() && isExtensionRedirect(redirect) ? redirect : null
  } catch {
    return null
  }
}

export function authorizeUrl(state: string): string {
  const url = new URL('https://app.attio.com/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('ATTIO_OAUTH_CLIENT_ID'),
    redirect_uri: callbackUrl(),
    state,
  }).toString()
  return url.toString()
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch('https://app.attio.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(),
      client_id: requireEnv('ATTIO_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('ATTIO_OAUTH_CLIENT_SECRET'),
    }),
  })
  if (!res.ok) throw new Error(`Attio token exchange failed ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { access_token: accessToken } = (await res.json()) as { access_token?: string }
  if (!accessToken) throw new Error('Attio token exchange returned no access_token')
  return accessToken
}

let teamWorkspace: Promise<{ id: string; name: string }> | null = null

/** The team's workspace is the one the server's own Attio token belongs to. */
export function getTeamWorkspace(): Promise<{ id: string; name: string }> {
  teamWorkspace ??= attio()
    .self()
    .then((self) => ({ id: self.workspaceId, name: self.workspaceName }))
    .catch((error: unknown) => {
      teamWorkspace = null
      throw error
    })
  return teamWorkspace
}

/** Ends the flow inside launchWebAuthFlow; the result rides in the fragment, never in logs. */
export function redirectToExtension(redirect: string, params: Record<string, string>): Response {
  return new Response(null, { status: 302, headers: { location: `${redirect}#${new URLSearchParams(params)}` } })
}
