import {
  defaultRequestConfig,
  type FetchResult,
  type PendingLink,
  type RequestName,
  type RequestSpec,
  type SyncHealth,
  type SyncRequest,
  type SyncResponse,
} from '@linkedin-sync/core'
import { applyFetch, type SyncContext } from './apply'
import { oldestLiveIncident, resolveIncident } from './incidents'
import { ingest } from './ingest'
import { syncNote } from './linking'
import { pendingLinkFrom, toMs, type AccountRow, type UserRow } from './rows'
import {
  conversationsNeedingThreadFetch,
  conversationsWithDirtyNotes,
  conversationsWithStatus,
  failedFetchesToReplay,
  getAccountForUser,
  markReplayed,
  markReplayFailed,
  pruneFailedFetches,
  updateAccount,
} from './store'

const POLL_INTERVAL_MS = 60_000
const AUTH_RETRY_INTERVAL_MS = 5 * 60_000
const MIN_POLL_AFTER_MS = 30_000
const MAX_REQUESTS_PER_RESPONSE = 10
// a finished review can link dozens of conversations at once
const MAX_NOTE_SYNCS_PER_TICK = 10
const REPLAY_BATCH = 25
const PENDING_LINKS_SHOWN = 10

export async function handleSync(req: SyncRequest, user: UserRow): Promise<SyncResponse> {
  const queued = new Map<string, RequestSpec>()
  const failed = new Set<RequestName>()
  const ctx: SyncContext = {
    userId: user.id,
    timeZone: req.timeZone,
    extensionVersion: req.extensionVersion,
    enqueue: (spec) => queued.set(`${spec.request}:${JSON.stringify(spec.params)}`, spec),
  }

  await replayFailedFetches(ctx)
  for (const result of req.results) {
    if (!(await ingest(result, ctx, req.observedRequests))) failed.add(result.request)
  }

  const account = await getAccountForUser(user.id)
  if (account) {
    await updateAccount(account.mailbox_urn, {
      last_seen_at: new Date().toISOString(),
      time_zone: req.timeZone,
      extension_version: req.extensionVersion,
    })
    await flushNotes(account)
  }

  const plan = await planNext(account, [...queued.values()], failed)
  return {
    ...plan,
    configVersion: defaultRequestConfig.version,
    health: await health(await getAccountForUser(user.id)),
    pendingLinks: account ? await pendingLinks(account) : [],
  }
}

/** Failures stored under an older build get one retry per deploy; success resolves their incident. */
async function replayFailedFetches(ctx: SyncContext): Promise<void> {
  const rows = await failedFetchesToReplay(ctx.userId, REPLAY_BATCH)
  for (const row of rows) {
    const result: FetchResult = {
      request: row.request,
      params: row.params,
      configVersion: row.config_version,
      status: row.status,
      body: row.body,
      fetchedAt: toMs(row.fetched_at),
    }
    try {
      await applyFetch(result, ctx)
      await markReplayed(row.id)
      if (row.incident_id) await resolveIncident(row.incident_id)
    } catch (error) {
      await markReplayFailed(row.id, error)
    }
  }
  if (rows.length) await pruneFailedFetches()
}

async function flushNotes(account: AccountRow): Promise<void> {
  for (const conversation of await conversationsWithDirtyNotes(account.mailbox_urn, MAX_NOTE_SYNCS_PER_TICK)) {
    try {
      await syncNote(account, conversation)
    } catch (error) {
      // stays dirty and retries next tick
      console.error(`[sync] note sync failed for ${conversation.urn}`, error)
    }
  }
}

async function planNext(
  account: AccountRow | null,
  queued: RequestSpec[],
  failed: Set<RequestName>,
): Promise<Pick<SyncResponse, 'next' | 'pollAfterMs'>> {
  if (queued.length) return { next: queued.slice(0, MAX_REQUESTS_PER_RESPONSE), pollAfterMs: 0 }

  if (!account) {
    // don't hammer /me while it's failing
    return failed.has('me')
      ? { next: [], pollAfterMs: POLL_INTERVAL_MS }
      : { next: [{ request: 'me', params: {} }], pollAfterMs: 0 }
  }

  // first sign-in: page back through the inbox for the review, one page per round
  if (account.review_status === 'collecting' && !failed.has('inboxPage') && !failed.has('inboxPageAfter')) {
    const spec: RequestSpec = account.review_cursor
      ? { request: 'inboxPageAfter', params: { mailboxUrn: account.mailbox_urn, cursor: account.review_cursor } }
      : { request: 'inboxPage', params: { mailboxUrn: account.mailbox_urn } }
    return { next: [spec], pollAfterMs: 0 }
  }

  // linked or pending threads whose history a manual sync or the review didn't get to finish
  if (!failed.has('messages')) {
    const unfetched = await conversationsNeedingThreadFetch(account.mailbox_urn, MAX_REQUESTS_PER_RESPONSE)
    if (unfetched.length) {
      return { next: unfetched.map((c) => ({ request: 'messages', params: { conversationUrn: c.urn } })), pollAfterMs: 0 }
    }
  }

  const interval = account.auth_status === 'auth_required' ? AUTH_RETRY_INTERVAL_MS : POLL_INTERVAL_MS
  const elapsed = account.last_polled_at ? Date.now() - toMs(account.last_polled_at) : Number.POSITIVE_INFINITY
  if (failed.has('conversations') || elapsed < interval - 5_000) {
    const wait = Number.isFinite(elapsed) ? interval - elapsed : interval
    return { next: [], pollAfterMs: Math.max(wait, MIN_POLL_AFTER_MS) }
  }

  // stamped at dispatch so a failing poll can't turn into a tight loop
  await updateAccount(account.mailbox_urn, { last_polled_at: new Date().toISOString() })
  return { next: [{ request: 'conversations', params: { mailboxUrn: account.mailbox_urn } }], pollAfterMs: 0 }
}

async function health(account: AccountRow | null): Promise<SyncHealth> {
  if (account?.auth_status === 'auth_required') {
    return { status: 'auth_required', message: 'LinkedIn signed you out or wants verification. Open linkedin.com and log in.' }
  }
  const incident = await oldestLiveIncident()
  if (incident) {
    const message = incident.status === 'dispatched' ? `Auto-fix in progress: ${incident.summary}` : incident.summary
    return { status: 'degraded', incidentId: incident.id, message }
  }
  return { status: 'ok' }
}

async function pendingLinks(account: AccountRow): Promise<PendingLink[]> {
  const rows = await conversationsWithStatus(account.mailbox_urn, 'pending', PENDING_LINKS_SHOWN)
  return rows.map(pendingLinkFrom).filter((link) => link !== null)
}
