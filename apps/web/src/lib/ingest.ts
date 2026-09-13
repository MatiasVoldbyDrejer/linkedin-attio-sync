import { LinkedInParseError, scrubPayload, type FetchResult } from '@linkedin-sync/core'
import {
  applyFetch,
  AuthRequiredError,
  CanaryError,
  FetchFailedError,
  TransientFetchError,
  type SyncContext,
} from './apply'
import { recordIncident } from './incidents'
import { AccountClaimedError, getAccountForUser, recordFailedFetch, updateAccount } from './store'

/**
 * Applies one LinkedIn response the extension fetched. Failures become incidents,
 * auth flags or stored retries rather than errors. Returns false when it couldn't be applied.
 */
export async function ingest(result: FetchResult, ctx: SyncContext, observedRequests: string[]): Promise<boolean> {
  try {
    await applyFetch(result, ctx)
    return true
  } catch (error) {
    if (error instanceof TransientFetchError) return false
    if (error instanceof AuthRequiredError) {
      const account = await getAccountForUser(ctx.userId)
      if (account) await updateAccount(account.mailbox_urn, { auth_status: 'auth_required' })
      return false
    }
    if (error instanceof AccountClaimedError) {
      // not a LinkedIn change, so no incident; the side panel keeps saying no account is connected
      console.warn(`[sync] ${error.message}`)
      return false
    }

    const incidentId = await incidentFor(error, result, observedRequests)
    if (incidentId === null) console.error(`[sync] applying ${result.request} failed`, error)
    // fetch failures and canaries carry no body a fixed parser could use
    if (!(error instanceof FetchFailedError || error instanceof CanaryError)) {
      await recordFailedFetch(ctx.userId, result, error, incidentId)
    }
    return false
  }
}

async function incidentFor(error: unknown, result: FetchResult, observedRequests: string[]): Promise<string | null> {
  const common = { request: result.request, body: result.body, configVersion: result.configVersion, observedRequests }
  if (error instanceof LinkedInParseError) {
    return recordIncident({
      ...common,
      kind: 'parse_error',
      paths: error.issues.map((i) => i.path),
      summary: `${error.request} response schema changed (${error.issues.length} issue${error.issues.length === 1 ? '' : 's'})`,
      details: error.issues,
    })
  }
  if (error instanceof CanaryError) {
    return recordIncident({ ...common, kind: 'canary', paths: [error.code], summary: error.message, details: { code: error.code } })
  }
  if (error instanceof FetchFailedError) {
    return recordIncident({
      ...common,
      kind: 'fetch_failed',
      paths: [String(error.status)],
      summary: error.message,
      // params carry the mailbox and conversation URNs
      details: { status: error.status, params: scrubPayload(result.params) },
    })
  }
  return null
}
