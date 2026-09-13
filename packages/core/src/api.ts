import type { RequestName } from './linkedin/requests'
import type { LiParticipant } from './linkedin/types'
import type { AttioPersonSummary } from './attio/client'

/**
 * Extension ↔ backend protocol. The backend decides what to fetch; the extension
 * only executes named requests from the LinkedIn request config and returns raw
 * responses. Keeping decisions server-side is what lets self-heal fixes ship as
 * a deploy.
 *
 * All endpoints except sign-in take `Authorization: Bearer <session token>`; a 401
 * means the token is missing, revoked or expired and the user has to sign in again.
 */

/**
 * Sign in with Attio. The extension calls `chrome.identity.launchWebAuthFlow` on
 * `GET /api/auth/attio/start?redirect=<chrome.identity.getRedirectURL(AUTH_REDIRECT_PATH)>`.
 * The backend runs the Attio OAuth flow and finally redirects to that chromiumapp.org
 * URL with the outcome in the fragment:
 *   `#token=<session token>` on success
 *   `#error=<AuthErrorCode>&message=<text>` on failure
 */
export const AUTH_REDIRECT_PATH = 'attio'

export type AuthErrorCode =
  /** Signed in to an Attio workspace other than the team's */
  | 'wrong_workspace'
  /** Declined on Attio's consent screen */
  | 'denied'
  | 'server_error'

/** GET /api/me */
export interface MeResponse {
  user: { name: string; email: string | null }
  workspaceName: string
  /** The LinkedIn account syncing under this user, once the extension has reported it */
  linkedIn: { name: string; profileUrl: string | null } | null
  /** Where the first-sign-in review of recent conversations stands; `done` once submitted */
  reviewStatus: ReviewStatus
  extension: {
    /** Newest build the team should run; the side panel nudges when the installed one is older */
    latestVersion: string
    /** Unpacked build download from the install page */
    downloadUrl: string
  }
}

/** POST /api/auth/signout revokes the calling token; responds 204 */

export interface RequestSpec {
  request: RequestName
  params: Record<string, string | number>
}

export interface FetchResult extends RequestSpec {
  configVersion: string
  status: number
  /** Parsed JSON, or null when the body wasn't JSON (e.g. a login redirect) */
  body: unknown
  fetchedAt: number
}

/** POST /api/sync */
export interface SyncRequest {
  extensionVersion: string
  timeZone: string
  results: FetchResult[]
  /**
   * Voyager messaging request paths LinkedIn's own web app made recently, taken
   * from `performance` resource entries in open linkedin.com tabs, with URN ids
   * scrubbed. When LinkedIn rotates a queryId these carry the new one, which is
   * what lets the self-heal agent fix fetch failures without browser access.
   */
  observedRequests: string[]
}

export type SyncHealth =
  | { status: 'ok' }
  /** A parser or request broke; the self-heal agent has been dispatched */
  | { status: 'degraded'; incidentId: string; message: string }
  /** LinkedIn session is gone or challenged; only the user can fix this */
  | { status: 'auth_required'; message: string }

export interface SyncResponse {
  /** Requests to run now, then POST their results back */
  next: RequestSpec[]
  /** When `next` is empty, how long to wait before the next tick */
  pollAfterMs: number
  configVersion: string
  health: SyncHealth
  pendingLinks: PendingLink[]
}

/** GET /api/linkedin/config → LinkedInRequestConfig */

/** An unlinked 1:1 thread where the user has replied, awaiting a decision */
export interface PendingLink {
  conversationUrn: string
  threadUrl: string | null
  contact: LiParticipant
  lastActivityAt: number
  /** Fuzzy Attio matches on the contact's name, best first */
  suggestions: AttioPersonSummary[]
}

/** GET /api/attio/people?q= → { people: AttioPersonSummary[] } */

/** POST /api/links */
export interface LinkRequest {
  conversationUrn: string
  action: { type: 'link'; recordId: string } | { type: 'create' } | { type: 'ignore' }
}

export interface LinkResponse {
  recordId: string | null
  noteId: string | null
}

export type ReviewStatus =
  /** The extension is still paging back through the inbox (or hasn't reported the LinkedIn account yet) */
  | 'collecting'
  | 'ready'
  | 'done'

/**
 * GET /api/review — the first-sign-in review. After signing in, the sync loop pages back
 * through the inbox until it has the most recent 1:1 conversations; the teammate then
 * picks an Attio person for each one that should sync. Poll while `collecting`.
 */
export interface ReviewResponse {
  status: ReviewStatus
  /** 1:1 conversations read so far, out of `target` */
  collected: number
  target: number
  /** Conversations to decide on, newest first; empty while collecting */
  items: ReviewItem[]
  /** How many of the recent conversations already sync to Attio and are left out of `items` */
  alreadyLinked: number
}

export interface ReviewItem {
  conversationUrn: string
  threadUrl: string | null
  contact: LiParticipant
  lastActivityAt: number
  /** The Attio person with this contact's LinkedIn URL, or the one a teammate linked them to; preselect it */
  match: AttioPersonSummary | null
  /** Fuzzy matches on the contact's name, best first, excluding `match` */
  suggestions: AttioPersonSummary[]
  /** Previously dismissed with "Never for this conversation" */
  ignored: boolean
}

export interface ReviewDecision {
  conversationUrn: string
  action: { type: 'link'; recordId: string } | { type: 'create' } | { type: 'skip' }
}

/** POST /api/review — the decisions from the review page; items without one are skipped */
export interface ReviewSubmitRequest {
  decisions: ReviewDecision[]
}

export interface ReviewSubmitResponse {
  linked: number
  skipped: number
  /** Decisions Attio rejected (e.g. a person deleted meanwhile); those conversations stay unlinked */
  failed: number
}

/**
 * POST /api/conversations/sync — the user pressed "Sync to Attio" on a thread page.
 * `threadId` is the `2-…` segment of linkedin.com/messaging/thread/<threadId>/.
 *
 * A small request loop that bypasses the background sync: while a response has
 * `next`, run those requests right away and POST again with their `results`.
 * Every response is a usable status, so the UI can update after each round.
 */
export interface ManualSyncRequest {
  threadId: string
  results?: FetchResult[]
}

export type ManualSyncResponse = (
  /** Linked; once the thread fetch in `next` comes back, the note has been rewritten */
  | { status: 'linked'; recordId: string }
  /** Waiting for the user to pick the Attio person, even if it was ignored before */
  | { status: 'needs_link'; pendingLink: PendingLink }
  /** Not in the synced inbox page; `next` looks it up by id */
  | { status: 'searching' }
  /** The lookup came back empty or kept failing */
  | { status: 'not_found' }
  /** Group chats and non-member senders can't map to one Attio person */
  | { status: 'unsupported'; message: string }
) & { next: RequestSpec[] }
