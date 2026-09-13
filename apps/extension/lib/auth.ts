import { browser } from 'wxt/browser'
import type * as core from '@linkedin-sync/core'
import type { AuthErrorCode, MeResponse } from '@linkedin-sync/core'
import { BackendClient, isUnauthorized } from './backend'
import { backendUrl } from './config'
import { endSession, SESSION_EXPIRED } from './session'
import { getLocal, getSettings, removeLocal, setLocal } from './storage'

// Checked against the contract at compile time without bundling core's parsers
const AUTH_REDIRECT_PATH: typeof core.AUTH_REDIRECT_PATH = 'attio'

const AUTH_ERRORS: Record<AuthErrorCode, string> = {
  wrong_workspace: 'That Attio account isn’t in your team’s workspace. Sign in with your work Attio account.',
  denied: 'Access wasn’t granted in Attio, so the extension can’t sync.',
  server_error: 'Sign-in failed on our side. Try again in a moment.',
}

/**
 * Runs the Attio sign-in window. Works from any extension context; the background
 * starts syncing when it sees the new settings. Resolves false if the user closed it.
 */
export async function signIn(): Promise<boolean> {
  const backend = await backendUrl()
  const redirect = browser.identity.getRedirectURL(AUTH_REDIRECT_PATH)
  let finalUrl: string | undefined
  try {
    finalUrl = await browser.identity.launchWebAuthFlow({
      url: `${backend}/api/auth/attio/start?redirect=${encodeURIComponent(redirect)}`,
      interactive: true,
    })
  } catch (error) {
    if (/did not approve/i.test((error as Error).message)) return false
    throw new Error(`Couldn’t open Attio sign-in: ${(error as Error).message}`)
  }
  if (!finalUrl) return false

  const params = new URLSearchParams(new URL(finalUrl).hash.slice(1))
  const token = params.get('token')
  if (!token) {
    const code = params.get('error') as AuthErrorCode | null
    throw new Error((code && AUTH_ERRORS[code]) || params.get('message') || AUTH_ERRORS.server_error)
  }

  await removeLocal('authNotice')
  await setLocal('settings', { backendUrl: backend, token })
  await refreshMe()
  return true
}

export async function signOut(): Promise<void> {
  const settings = await getSettings()
  // revoking is best effort; the local session ends regardless
  if (settings) await new BackendClient(settings).signOut().catch(() => {})
  await endSession(null)
}

/** Refreshes the cached `me`; falls back to the cache when the backend is unreachable. */
export async function refreshMe(): Promise<MeResponse | null> {
  const settings = await getSettings()
  if (!settings) return null
  try {
    const me = await new BackendClient(settings).me()
    await setLocal('me', me)
    return me
  } catch (error) {
    if (isUnauthorized(error)) {
      await endSession(SESSION_EXPIRED)
      return null
    }
    return (await getLocal('me')) ?? null
  }
}
