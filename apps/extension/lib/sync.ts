import { browser } from 'wxt/browser'
import type { FetchResult, ManualSyncResponse, PendingLink, SyncResponse } from '@linkedin-sync/core'
import { defaultRequestConfig, type LinkedInRequestConfig } from '@linkedin-sync/core/requests'
import { BackendClient, isUnauthorized, SIGN_IN_MESSAGE } from './backend'
import { executeLinkedInRequest } from './linkedin-fetch'
import { endSession, SESSION_EXPIRED, SYNC_ALARM } from './session'
import { emptySyncState, getLocal, getSettings, setLocal, updateLocal } from './storage'

const MAX_FETCHES_PER_TICK = 25
/** Lookup, then thread fetch, plus one retry */
const MANUAL_SYNC_ROUNDS = 3
/** chrome.alarms won't fire more often than this for packed extensions anyway */
const MIN_POLL_MS = 60_000
const RETRY_AFTER_ERROR_MS = 5 * 60_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function scheduleNext(ms: number): Promise<void> {
  await browser.alarms.create(SYNC_ALARM, { when: Date.now() + Math.max(ms, MIN_POLL_MS) })
}

async function loadConfig(client: BackendClient, wantedVersion?: string): Promise<LinkedInRequestConfig> {
  const cached = await getLocal('requestConfig')
  if (cached && (!wantedVersion || cached.version === wantedVersion)) return cached
  try {
    const fresh = await client.config()
    await setLocal('requestConfig', fresh)
    return fresh
  } catch {
    return cached ?? defaultRequestConfig
  }
}

async function recordResponse(response: SyncResponse): Promise<void> {
  await setLocal('syncState', {
    health: response.health,
    pendingLinks: response.pendingLinks,
    lastSyncAt: Date.now(),
    lastError: null,
  })
}

/**
 * One sync round: report results, run whatever the backend asks for next, repeat
 * until it has nothing left (or the per-tick cap is hit), then sleep via alarm.
 */
async function tick(): Promise<void> {
  const settings = await getSettings()
  // signed out: no polling until someone signs in
  if (!settings) return
  const client = new BackendClient(settings)
  let config = await loadConfig(client)
  let results = (await getLocal('pendingResults')) ?? []
  let fetches = 0

  try {
    for (;;) {
      const response = await client.sync({
        extensionVersion: browser.runtime.getManifest().version,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        results,
        observedRequests: (await getLocal('observedRequests')) ?? [],
      })
      await setLocal('pendingResults', [])
      await recordResponse(response)
      if (response.configVersion !== config.version) config = await loadConfig(client, response.configVersion)

      if (response.next.length === 0) return await scheduleNext(response.pollAfterMs)
      if (fetches >= MAX_FETCHES_PER_TICK) return await scheduleNext(MIN_POLL_MS)

      results = []
      for (const spec of response.next.slice(0, MAX_FETCHES_PER_TICK - fetches)) {
        // pace requests like a person clicking around, not a crawler
        if (fetches > 0) await sleep(1000 + Math.random() * 2000)
        results.push(await executeLinkedInRequest(config, spec))
        fetches++
        await setLocal('pendingResults', results)
      }
    }
  } catch (error) {
    if (isUnauthorized(error)) return await endSession(SESSION_EXPIRED)
    await updateLocal('syncState', emptySyncState, (state) => ({ ...state, lastError: (error as Error).message }))
    await scheduleNext(RETRY_AFTER_ERROR_MS)
  }
}

let inFlight: Promise<void> | null = null

/** Concurrent triggers (alarm + "Sync now") share one run. */
export function runSync(): Promise<void> {
  inFlight ??= tick().finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * A run that starts after any in-flight one, so it sees backend state changed by
 * the caller instead of joining a run already past it.
 */
export async function runFreshSync(): Promise<void> {
  if (inFlight) await inFlight
  return runSync()
}

/** Puts a thread's card in local state so it shows before the next sync run reports it. */
async function rememberPendingLink(link: PendingLink): Promise<void> {
  await updateLocal('syncState', emptySyncState, (state) => ({
    ...state,
    pendingLinks: [link, ...state.pendingLinks.filter((l) => l.conversationUrn !== link.conversationUrn)],
  }))
}

/**
 * "Sync to Attio" for one thread: runs the backend's follow-up LinkedIn requests
 * straight away, without pacing, instead of queueing behind the background sync.
 */
export async function runManualSync(threadId: string): Promise<ManualSyncResponse> {
  const settings = await getSettings()
  if (!settings) throw new Error(SIGN_IN_MESSAGE)
  const client = new BackendClient(settings)
  const config = await loadConfig(client)

  let response = await client.manualSync({ threadId })
  for (let round = 0; round < MANUAL_SYNC_ROUNDS && response.next.length > 0; round++) {
    // show the card now; the thread fetch in `next` only fills in the note
    if (response.status === 'needs_link') await rememberPendingLink(response.pendingLink)
    const results: FetchResult[] = []
    for (const spec of response.next) results.push(await executeLinkedInRequest(config, spec))
    response = await client.manualSync({ threadId, results })
  }
  if (response.status === 'needs_link') await rememberPendingLink(response.pendingLink)
  return response
}
