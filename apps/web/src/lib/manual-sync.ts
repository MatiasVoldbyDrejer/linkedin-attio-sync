import type { ManualSyncRequest, ManualSyncResponse, RequestSpec } from '@linkedin-sync/core'
import type { SyncContext } from './apply'
import { ingest } from './ingest'
import { requestLinkDecision, syncNote } from './linking'
import { pendingLinkFrom, type AccountRow, type ConversationRow, type UserRow } from './rows'
import {
  createManualSyncRequest,
  deleteManualSyncRequests,
  getConversation,
  getAccountForUser,
  getManualSyncRequest,
  setManualSyncLookupAttempts,
  updateConversation,
} from './store'

/** A lookup is one LinkedIn request; a few tries covers a flaky moment or a rate limit. */
const MAX_LOOKUP_ATTEMPTS = 3
const UNSUPPORTED = 'Group chats and company messages can’t be linked to one Attio person'
const NO_ACCOUNT = 'Your LinkedIn account isn’t connected yet. Give it a minute after signing in, then try again.'

/**
 * One round of the "Sync to Attio" loop. The extension runs `next` right away and
 * posts the results back, so a click doesn't wait for the background sync.
 */
export async function handleManualSync(
  { threadId, results = [] }: ManualSyncRequest,
  user: UserRow,
): Promise<ManualSyncResponse> {
  const account = await getAccountForUser(user.id)
  // a freshly signed-in teammate whose extension hasn't reported their LinkedIn profile yet
  if (!account) return { status: 'unsupported', message: NO_ACCOUNT, next: [] }
  const urn = `urn:li:msg_conversation:(${account.mailbox_urn},${threadId})`

  // results go through the same pipeline as regular syncs, incidents included
  const ctx: SyncContext = { userId: user.id, timeZone: account.time_zone, extensionVersion: '', enqueue: () => {} }
  const applied = new Set<string>()
  for (const result of results) {
    if (await ingest(result, ctx, [])) applied.add(result.request)
  }

  const conversation = await getConversation(urn)
  if (!conversation) return lookUp(account, urn, applied.has('conversationById'))
  await deleteManualSyncRequests([urn])
  if (!conversation.contact_urn) return { status: 'unsupported', message: UNSUPPORTED, next: [] }

  if (!applied.has('messages')) {
    // first round for this click: ask about unlinked or ignored threads, then refetch the whole thread
    await updateConversation(urn, { messages_synced_through: null })
    if (conversation.link_status === 'unlinked' || conversation.link_status === 'ignored') {
      await requestLinkDecision(conversation)
    }
    return respond(await getConversation(urn), [{ request: 'messages', params: { conversationUrn: urn } }])
  }

  // the thread is in: rewrite a linked note now instead of on the next poll
  if (conversation.link_status === 'linked' && conversation.note_dirty) {
    try {
      await syncNote(account, conversation)
    } catch (error) {
      // stays dirty; the regular sync retries it
      console.error(`[manual-sync] note sync failed for ${urn}`, error)
    }
  }
  return respond(conversation, [])
}

async function lookUp(account: AccountRow, urn: string, lookupApplied: boolean): Promise<ManualSyncResponse> {
  const request = await getManualSyncRequest(urn)
  // a lookup that came back fine but still left no conversation means LinkedIn doesn't have it
  if (lookupApplied || (request && request.lookup_attempts >= MAX_LOOKUP_ATTEMPTS)) {
    await deleteManualSyncRequests([urn])
    return { status: 'not_found', next: [] }
  }
  if (request) await setManualSyncLookupAttempts([request], (attempts) => attempts + 1)
  else await createManualSyncRequest(account.mailbox_urn, urn)
  return { status: 'searching', next: [{ request: 'conversationById', params: { conversationUrn: urn } }] }
}

function respond(conversation: ConversationRow | null, next: RequestSpec[]): ManualSyncResponse {
  if (conversation?.link_status === 'linked' && conversation.attio_record_id) {
    return { status: 'linked', recordId: conversation.attio_record_id, next }
  }
  const pendingLink = conversation ? pendingLinkFrom(conversation) : null
  return pendingLink ? { status: 'needs_link', pendingLink, next } : { status: 'unsupported', message: UNSUPPORTED, next: [] }
}
