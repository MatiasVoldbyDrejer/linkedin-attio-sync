import type { FetchResult } from '@linkedin-sync/core'
import { db, unwrap } from './supabase'
import { BUILD, type AccountRow, type ConversationRow, type LinkStatus, type MessageRow } from './rows'

export async function getAccountForUser(userId: string): Promise<AccountRow | null> {
  return unwrap(db().from('sync_accounts').select('*').eq('user_id', userId).maybeSingle())
}

export async function requireAccount(userId: string): Promise<AccountRow> {
  const account = await getAccountForUser(userId)
  if (!account) throw new Error('No LinkedIn account yet; /me has not been synced')
  return account
}

/** Two teammates signed in to the same LinkedIn account. */
export class AccountClaimedError extends Error {}

/**
 * Binds the LinkedIn mailbox a teammate's extension reported to that teammate. A mailbox
 * belongs to one teammate; switching LinkedIn accounts releases the previous one.
 */
export async function claimAccount(
  userId: string,
  row: Pick<AccountRow, 'mailbox_urn' | 'self_participant' | 'time_zone'>,
): Promise<void> {
  const existing = await unwrap<{ user_id: string | null } | null>(
    db().from('sync_accounts').select('user_id').eq('mailbox_urn', row.mailbox_urn).maybeSingle(),
  )
  if (existing?.user_id && existing.user_id !== userId) {
    throw new AccountClaimedError(`LinkedIn account ${row.mailbox_urn} is connected to another teammate`)
  }
  await unwrap(db().from('sync_accounts').update({ user_id: null }).eq('user_id', userId).neq('mailbox_urn', row.mailbox_urn))
  await unwrap(db().from('sync_accounts').upsert({ ...row, user_id: userId, auth_status: 'ok' }))
}

export async function updateAccount(mailboxUrn: string, patch: Partial<AccountRow> & Record<string, unknown>): Promise<void> {
  await unwrap(db().from('sync_accounts').update(patch).eq('mailbox_urn', mailboxUrn))
}

export async function getConversation(urn: string): Promise<ConversationRow | null> {
  return unwrap(db().from('conversations').select('*').eq('urn', urn).maybeSingle())
}

export async function getConversations(urns: string[]): Promise<Map<string, ConversationRow>> {
  if (urns.length === 0) return new Map()
  const rows = await unwrap<ConversationRow[]>(db().from('conversations').select('*').in('urn', urns))
  return new Map(rows.map((r) => [r.urn, r]))
}

/** Every row must carry the same keys, or PostgREST nulls the missing columns. */
export async function upsertConversations(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length) await unwrap(db().from('conversations').upsert(rows))
}

export async function updateConversation(urn: string, patch: Partial<ConversationRow> & Record<string, unknown>): Promise<void> {
  await unwrap(db().from('conversations').update({ ...patch, updated_at: new Date().toISOString() }).eq('urn', urn))
}

export async function conversationsWithStatus(mailboxUrn: string, status: LinkStatus, limit: number): Promise<ConversationRow[]> {
  return unwrap(
    db()
      .from('conversations')
      .select('*')
      .eq('mailbox_urn', mailboxUrn)
      .eq('link_status', status)
      .order('last_activity_at', { ascending: false })
      .limit(limit),
  )
}

/** Threads with exactly one other LinkedIn member, newest first. */
export async function recentOneToOneConversations(mailboxUrn: string, limit: number): Promise<ConversationRow[]> {
  return unwrap(
    db()
      .from('conversations')
      .select('*')
      .eq('mailbox_urn', mailboxUrn)
      .not('contact_urn', 'is', null)
      .order('last_activity_at', { ascending: false })
      .limit(limit),
  )
}

export async function countOneToOneConversations(mailboxUrn: string, upTo: number): Promise<number> {
  const rows = await unwrap<{ urn: string }[]>(
    db().from('conversations').select('urn').eq('mailbox_urn', mailboxUrn).not('contact_urn', 'is', null).limit(upTo),
  )
  return rows.length
}

/** Any teammate's link for this LinkedIn member counts: it's the same person in Attio. */
export async function linkedConversationWithContact(contactUrn: string): Promise<ConversationRow | null> {
  return unwrap(
    db()
      .from('conversations')
      .select('*')
      .eq('contact_urn', contactUrn)
      .eq('link_status', 'linked')
      .limit(1)
      .maybeSingle(),
  )
}

export async function conversationsWithDirtyNotes(mailboxUrn: string, limit: number): Promise<ConversationRow[]> {
  return unwrap(
    db()
      .from('conversations')
      .select('*')
      .eq('mailbox_urn', mailboxUrn)
      .eq('link_status', 'linked')
      .eq('note_dirty', true)
      .limit(limit),
  )
}

export async function upsertMessages(rows: MessageRow[]): Promise<void> {
  if (rows.length) await unwrap(db().from('messages').upsert(rows))
}

export async function deleteMessages(urns: string[]): Promise<void> {
  if (urns.length) await unwrap(db().from('messages').delete().in('urn', urns))
}

export async function listMessages(conversationUrn: string): Promise<MessageRow[]> {
  return unwrap(db().from('messages').select('*').eq('conversation_urn', conversationUrn).order('sent_at'))
}

interface FailedFetchRow {
  id: number
  request: FetchResult['request']
  params: FetchResult['params']
  config_version: string
  status: number
  body: unknown
  fetched_at: string
  incident_id: string | null
}

export async function recordFailedFetch(
  userId: string,
  result: FetchResult,
  error: unknown,
  incidentId: string | null,
): Promise<void> {
  await unwrap(
    db()
      .from('failed_fetches')
      .insert({
        user_id: userId,
        request: result.request,
        params: result.params,
        config_version: result.configVersion,
        status: result.status,
        body: result.body,
        fetched_at: new Date(result.fetchedAt).toISOString(),
        error: error instanceof Error ? error.message : String(error),
        incident_id: incidentId,
        failed_build: BUILD,
      }),
  )
}

/** A teammate's failures recorded under a different build: the code may have been fixed since. */
export async function failedFetchesToReplay(userId: string, limit: number): Promise<FailedFetchRow[]> {
  return unwrap(
    db()
      .from('failed_fetches')
      .select('id, request, params, config_version, status, body, fetched_at, incident_id')
      .eq('user_id', userId)
      .is('replayed_at', null)
      .neq('failed_build', BUILD)
      .order('received_at')
      .limit(limit),
  )
}

export async function markReplayed(id: number): Promise<void> {
  await unwrap(db().from('failed_fetches').update({ replayed_at: new Date().toISOString(), replayed_build: BUILD }).eq('id', id))
}

export async function markReplayFailed(id: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await unwrap(db().from('failed_fetches').update({ failed_build: BUILD, error: message }).eq('id', id))
}

export async function pruneFailedFetches(olderThanDays = 14): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
  await unwrap(db().from('failed_fetches').delete().lt('received_at', cutoff))
}

/** Linked or pending threads whose full message history hasn't been fetched yet. */
export async function conversationsNeedingThreadFetch(mailboxUrn: string, limit: number): Promise<ConversationRow[]> {
  return unwrap(
    db()
      .from('conversations')
      .select('*')
      .eq('mailbox_urn', mailboxUrn)
      .in('link_status', ['pending', 'linked'])
      .is('messages_synced_through', null)
      .limit(limit),
  )
}

export interface ManualSyncRequestRow {
  conversation_urn: string
  lookup_attempts: number
}

export async function getManualSyncRequest(conversationUrn: string): Promise<ManualSyncRequestRow | null> {
  return unwrap(
    db().from('manual_sync_requests').select('conversation_urn, lookup_attempts').eq('conversation_urn', conversationUrn).maybeSingle(),
  )
}

export async function createManualSyncRequest(mailboxUrn: string, conversationUrn: string): Promise<void> {
  await unwrap(
    db()
      .from('manual_sync_requests')
      .upsert({ conversation_urn: conversationUrn, mailbox_urn: mailboxUrn }, { ignoreDuplicates: true }),
  )
}

export async function deleteManualSyncRequests(conversationUrns: string[]): Promise<void> {
  if (conversationUrns.length) await unwrap(db().from('manual_sync_requests').delete().in('conversation_urn', conversationUrns))
}

export async function setManualSyncLookupAttempts(
  requests: ManualSyncRequestRow[],
  attempts: (current: number) => number,
): Promise<void> {
  for (const request of requests) {
    await unwrap(
      db()
        .from('manual_sync_requests')
        .update({ lookup_attempts: attempts(request.lookup_attempts) })
        .eq('conversation_urn', request.conversation_urn),
    )
  }
}
