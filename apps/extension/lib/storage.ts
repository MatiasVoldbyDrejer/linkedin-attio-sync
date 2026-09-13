import { browser } from 'wxt/browser'
import type { FetchResult, LinkedInRequestConfig, MeResponse, PendingLink, SyncHealth } from '@linkedin-sync/core'

/** Present only while signed in */
export interface Settings {
  backendUrl: string
  token: string
}

export type FetchStrategy = 'worker' | 'tab'

export interface SyncState {
  health: SyncHealth | null
  pendingLinks: PendingLink[]
  lastSyncAt: number | null
  lastError: string | null
}

export interface LocalSchema {
  settings: Settings
  /** Developer override of the built-in backend URL */
  backendOverride: string
  /** Cached `GET /api/me` for the signed-in user */
  me: MeResponse
  /** Why the user was signed out, shown next to the sign-in button */
  authNotice: string
  syncState: SyncState
  requestConfig: LinkedInRequestConfig
  fetchStrategy: FetchStrategy
  /** Results fetched but not yet delivered, so a killed service worker loses nothing */
  pendingResults: FetchResult[]
  observedRequests: string[]
  /** conversationUrn → epoch ms until which the prompt stays hidden */
  snoozed: Record<string, number>
}

export type LocalKey = keyof LocalSchema

export const emptySyncState: SyncState = { health: null, pendingLinks: [], lastSyncAt: null, lastError: null }

export async function getLocal<K extends LocalKey>(key: K): Promise<LocalSchema[K] | undefined> {
  const stored = await browser.storage.local.get(key)
  return stored[key] as LocalSchema[K] | undefined
}

export async function setLocal<K extends LocalKey>(key: K, value: LocalSchema[K]): Promise<void> {
  await browser.storage.local.set({ [key]: value })
}

export async function removeLocal(...keys: LocalKey[]): Promise<void> {
  await browser.storage.local.remove(keys)
}

export async function updateLocal<K extends LocalKey>(
  key: K,
  fallback: LocalSchema[K],
  update: (current: LocalSchema[K]) => LocalSchema[K],
): Promise<LocalSchema[K]> {
  const next = update((await getLocal(key)) ?? fallback)
  await setLocal(key, next)
  return next
}

export async function getSettings(): Promise<Settings | null> {
  const settings = await getLocal('settings')
  return settings?.backendUrl && settings.token ? settings : null
}

export function onLocalChange<K extends LocalKey>(key: K, listener: (value: LocalSchema[K] | undefined) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && key in changes) listener(changes[key]!.newValue as LocalSchema[K] | undefined)
  }
  browser.storage.onChanged.addListener(handler)
  return () => browser.storage.onChanged.removeListener(handler)
}
