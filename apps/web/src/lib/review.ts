import type {
  AttioPersonSummary,
  ReviewDecision,
  ReviewItem,
  ReviewResponse,
  ReviewSubmitResponse,
} from '@linkedin-sync/core'
import { attio, findPeople, NotFoundError, resolvePerson } from './linking'
import { contactOf, toMs, type ConversationRow, type UserRow } from './rows'
import {
  getAccountForUser,
  linkedConversationWithContact,
  recentOneToOneConversations,
  updateAccount,
  updateConversation,
} from './store'

/** How many recent 1:1 conversations the first-sign-in review covers */
export const REVIEW_TARGET = 100
/** Pages of 25 before collecting stops regardless, for inboxes full of group chats */
export const REVIEW_MAX_PAGES = 8
/** Attio calls per contact are few, but a review can have 100 contacts */
const ATTIO_CONCURRENCY = 5

/** Collecting hasn't finished, so there's nothing to decide on yet. */
export class ReviewNotReadyError extends Error {}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(run))
}

export async function getReview(user: UserRow): Promise<ReviewResponse> {
  const account = await getAccountForUser(user.id)
  const base = { target: REVIEW_TARGET, items: [], alreadyLinked: 0 }
  // the extension hasn't reported the LinkedIn account yet
  if (!account) return { status: 'collecting', collected: 0, ...base }

  const recent = await recentOneToOneConversations(account.mailbox_urn, REVIEW_TARGET)
  const alreadyLinked = recent.filter((c) => c.link_status === 'linked').length
  if (account.review_status !== 'ready') {
    return { status: account.review_status, collected: recent.length, ...base, alreadyLinked }
  }

  const open = await withMatches(recent.filter((c) => c.link_status !== 'linked'))
  return {
    status: 'ready',
    collected: recent.length,
    target: REVIEW_TARGET,
    items: open.map(toItem).filter((item) => item !== null),
    alreadyLinked,
  }
}

/**
 * Looks up Attio people for conversations that haven't been looked up yet and stores the
 * results, so reloading the review page doesn't repeat a hundred searches.
 */
async function withMatches(rows: ConversationRow[]): Promise<ConversationRow[]> {
  const out = [...rows]
  const missing = out.map((row, index) => ({ row, index })).filter(({ row }) => !row.suggested_at)

  await inBatches(missing, ATTIO_CONCURRENCY, async ({ row, index }) => {
    const contact = contactOf(row)
    if (!contact) return
    try {
      const [found, teammateMatch] = await Promise.all([findPeople(contact, 3), matchFromTeammate(contact.urn)])
      // a teammate already decided who this is; that beats a LinkedIn URL lookup
      const match = teammateMatch ?? found.match
      const others = found.suggestions.filter((p) => p.recordId !== match?.recordId)
      const patch = {
        attio_match: match,
        // pending cards read suggestions too, and expect the match first
        suggestions: match ? [match, ...others] : others,
        suggested_at: new Date().toISOString(),
      }
      await updateConversation(row.urn, patch)
      out[index] = { ...row, ...patch }
    } catch (error) {
      // the row still shows, without suggestions; the next load retries
      console.error(`[review] Attio lookup failed for ${row.urn}`, error)
    }
  })
  return out
}

async function matchFromTeammate(contactUrn: string): Promise<AttioPersonSummary | null> {
  const sibling = await linkedConversationWithContact(contactUrn)
  if (!sibling?.attio_record_id) return null
  try {
    const person = await attio().getPerson(sibling.attio_record_id)
    return { recordId: person.recordId, name: person.name, image: null, emails: [] }
  } catch {
    // deleted in Attio since; fall back to the other lookups
    return null
  }
}

function toItem(row: ConversationRow): ReviewItem | null {
  const contact = contactOf(row)
  if (!contact) return null
  const match = row.attio_match
  return {
    conversationUrn: row.urn,
    threadUrl: row.thread_url,
    contact,
    lastActivityAt: toMs(row.last_activity_at),
    match,
    suggestions: (row.suggestions ?? []).filter((p) => p.recordId !== match?.recordId),
    ignored: row.link_status === 'ignored',
  }
}

/**
 * Applies the review. Linked conversations get their full history fetched by the next sync
 * rounds, which then write the notes; everything without a decision stops syncing.
 */
export async function submitReview(user: UserRow, decisions: ReviewDecision[]): Promise<ReviewSubmitResponse> {
  const account = await getAccountForUser(user.id)
  if (!account) throw new NotFoundError('Your LinkedIn account isn’t connected yet')
  if (account.review_status === 'collecting') throw new ReviewNotReadyError('Your conversations are still being collected')

  const chosen = new Map(decisions.map((d) => [d.conversationUrn, d.action]))
  const recent = await recentOneToOneConversations(account.mailbox_urn, REVIEW_TARGET)
  let linked = 0
  let skipped = 0
  let failed = 0

  await inBatches(
    recent.filter((c) => c.link_status !== 'linked'),
    ATTIO_CONCURRENCY,
    async (row) => {
      const action = chosen.get(row.urn) ?? { type: 'skip' }
      const contact = contactOf(row)
      if (action.type === 'skip' || !contact) {
        await updateConversation(row.urn, { link_status: 'ignored', suggestions: null })
        skipped++
        return
      }
      try {
        const recordId = await resolvePerson(contact, action)
        await updateConversation(row.urn, {
          link_status: 'linked',
          attio_record_id: recordId,
          suggestions: null,
          attio_match: null,
          // refetch the whole thread; its arrival marks the note dirty
          messages_synced_through: null,
          note_dirty: false,
        })
        linked++
      } catch (error) {
        console.error(`[review] linking ${row.urn} failed`, error)
        failed++
      }
    },
  )

  await updateAccount(account.mailbox_urn, {
    review_status: 'done',
    review_cursor: null,
    review_completed_at: new Date().toISOString(),
  })
  return { linked, skipped, failed }
}
