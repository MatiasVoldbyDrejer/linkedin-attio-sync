import {
  parseConversations,
  parseConversationsById,
  parseInboxPage,
  parseMe,
  parseMessages,
  type FetchResult,
  type LiConversation,
  type RequestName,
  type RequestSpec,
} from '@linkedin-sync/core'
import { resolveIncidentsFor } from './incidents'
import { requestLinkDecision } from './linking'
import { REVIEW_MAX_PAGES, REVIEW_TARGET } from './review'
import { messageRow, toIso, toMs, type AccountRow, type MessageRow } from './rows'
import {
  claimAccount,
  countOneToOneConversations,
  deleteMessages,
  getConversation,
  getConversations,
  requireAccount,
  updateAccount,
  updateConversation,
  upsertConversations,
  upsertMessages,
} from './store'

/** LinkedIn says the session is gone; only the user can fix it. */
export class AuthRequiredError extends Error {}
/** Rate limits, 5xx, no LinkedIn tab: retry on the next poll, no incident. */
export class TransientFetchError extends Error {}
/** LinkedIn rejected the request itself, usually a rotated queryId. */
export class FetchFailedError extends Error {
  constructor(
    readonly status: number,
    readonly request: RequestName,
  ) {
    super(`LinkedIn rejected ${request} with HTTP ${status}`)
  }
}
/** Parsed fine but implausible. */
export class CanaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface SyncContext {
  /** The signed-in teammate whose extension fetched the results */
  userId: string
  timeZone: string
  extensionVersion: string
  enqueue(spec: RequestSpec): void
}

export async function applyFetch(result: FetchResult, ctx: SyncContext): Promise<void> {
  const { request, status, body } = result
  if (status === 401 || status === 403) throw new AuthRequiredError(`LinkedIn ${status} on ${request}`)
  if (status === 0 || status === 429 || status >= 500) throw new TransientFetchError(`LinkedIn ${status} on ${request}`)
  if (status !== 200) throw new FetchFailedError(status, request)
  // a 200 that isn't JSON is LinkedIn's login or checkpoint page
  if (body === null) throw new AuthRequiredError(`LinkedIn returned a non-JSON page for ${request}`)

  switch (request) {
    case 'me':
      return applyMe(body, ctx)
    case 'conversations':
      return applyInbox(body, ctx)
    case 'inboxPage':
    case 'inboxPageAfter':
      return applyReviewPage(request, body, ctx)
    case 'conversationById':
      return applyConversationLookup(String(result.params.conversationUrn), body, ctx)
    case 'messages':
      return applyMessages(String(result.params.conversationUrn), body, ctx)
  }
}

async function applyMe(body: unknown, ctx: SyncContext): Promise<void> {
  const { mailboxUrn, self } = parseMe(body)
  await claimAccount(ctx.userId, { mailbox_urn: mailboxUrn, self_participant: self, time_zone: ctx.timeZone })
}

async function applyInbox(body: unknown, ctx: SyncContext): Promise<void> {
  const account = await requireAccount(ctx.userId)
  const { conversations } = parseConversations(body)
  if (conversations.length === 0) throw new CanaryError('empty_inbox', 'LinkedIn returned an empty inbox')
  await Promise.all([
    account.auth_status === 'ok' ? null : updateAccount(account.mailbox_urn, { auth_status: 'ok' }),
    resolveIncidentsFor('canary', 'conversations'),
    resolveIncidentsFor('fetch_failed', 'conversations'),
  ])
  await storeConversations(account, conversations, ctx)
}

/** One page of the first-sign-in review's walk back through the inbox. */
async function applyReviewPage(request: 'inboxPage' | 'inboxPageAfter', body: unknown, ctx: SyncContext): Promise<void> {
  const account = await requireAccount(ctx.userId)
  const { conversations, nextCursor } = parseInboxPage(body, request)
  await resolveIncidentsFor('fetch_failed', request)
  await storeConversations(account, conversations, ctx)

  // a replayed page mustn't move a review that has moved on
  if (account.review_status !== 'collecting') return
  const pages = account.review_pages + 1
  const collected = await countOneToOneConversations(account.mailbox_urn, REVIEW_TARGET)
  // an inbox of mostly group chats could page forever, so pages are capped too
  const finished = !nextCursor || conversations.length === 0 || collected >= REVIEW_TARGET || pages >= REVIEW_MAX_PAGES
  await updateAccount(account.mailbox_urn, {
    review_pages: pages,
    review_cursor: finished ? null : nextCursor,
    ...(finished ? { review_status: 'ready' } : {}),
  })
}

async function applyConversationLookup(conversationUrn: string, body: unknown, ctx: SyncContext): Promise<void> {
  const account = await requireAccount(ctx.userId)
  // a lookup LinkedIn answers without the thread leaves no row; the manual sync reports not_found
  const conversations = parseConversationsById(body).filter((c) => c.urn === conversationUrn)
  await resolveIncidentsFor('fetch_failed', 'conversationById')
  await storeConversations(account, conversations, ctx)
}

/** Upserts inbox or lookup results. */
async function storeConversations(account: AccountRow, conversations: LiConversation[], ctx: SyncContext): Promise<void> {
  const selfUrn = account.mailbox_urn
  const installedAt = toMs(account.created_at)
  // a teammate's extension can only report threads from its own mailbox
  const own = conversations.filter((c) => c.urn.includes(`(${selfUrn},`))
  const existing = await getConversations(own.map((c) => c.urn))
  const upserts: Record<string, unknown>[] = []
  const messages: MessageRow[] = []

  for (const c of own) {
    const row = existing.get(c.urn)
    const others = c.participants.filter((p) => p.urn !== selfUrn)
    const contactUrn = !c.groupChat && others.length === 1 ? others[0]!.urn : null
    const repliedNow = c.latestMessages.some((m) => m.senderUrn === selfUrn && m.sentAt > installedAt)
    const hasReplied = Boolean(row?.user_has_replied || repliedNow)

    // replays of old responses must not roll activity back
    if (!row || toMs(row.last_activity_at) < c.lastActivityAt || hasReplied !== row.user_has_replied) {
      upserts.push({
        urn: c.urn,
        mailbox_urn: selfUrn,
        thread_url: c.threadUrl,
        group_chat: c.groupChat,
        last_activity_at: toIso(Math.max(c.lastActivityAt, row ? toMs(row.last_activity_at) : 0)),
        participants: c.participants,
        contact_urn: contactUrn,
        user_has_replied: hasReplied,
        updated_at: new Date().toISOString(),
      })
    }

    const status = row?.link_status ?? 'unlinked'
    const wanted = status === 'linked' || status === 'pending' || (status === 'unlinked' && contactUrn !== null && hasReplied)
    // message text is only kept for threads headed to Attio, not a teammate's whole inbox
    if (wanted) messages.push(...c.latestMessages.map(messageRow))
    const stale = !row?.messages_synced_through || toMs(row.messages_synced_through) < c.lastActivityAt
    if (wanted && stale) ctx.enqueue({ request: 'messages', params: { conversationUrn: c.urn } })
  }

  await upsertConversations(upserts)
  await upsertMessages(messages)
}

async function applyMessages(conversationUrn: string, body: unknown, ctx: SyncContext): Promise<void> {
  const account = await requireAccount(ctx.userId)
  const page = parseMessages(body)
  const conversation = await getConversation(conversationUrn)
  if (!conversation || conversation.mailbox_urn !== account.mailbox_urn) return

  const messages = page.messages.filter((m) => m.conversationUrn === conversationUrn)
  await upsertMessages(messages.map(messageRow))
  await deleteMessages(page.deletedUrns)

  const installedAt = toMs(account.created_at)
  const hasReplied =
    conversation.user_has_replied || messages.some((m) => m.senderUrn === account.mailbox_urn && m.sentAt > installedAt)

  await updateConversation(conversationUrn, {
    messages_synced_through: conversation.last_activity_at,
    user_has_replied: hasReplied,
    note_dirty: conversation.link_status === 'linked' || conversation.note_dirty,
  })

  if (conversation.link_status === 'unlinked' && hasReplied && conversation.contact_urn) {
    await requestLinkDecision(conversation)
  }
}
