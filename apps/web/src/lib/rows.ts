import type { AttioPersonSummary, LiConversation, LiMessage, LiParticipant, PendingLink, ReviewStatus } from '@linkedin-sync/core'

/** Deploy identity; failed fetches are replayed once per new build. */
export const BUILD = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'dev'

export interface UserRow {
  id: string
  attio_workspace_member_id: string
  name: string
  email: string | null
}

export interface AccountRow {
  mailbox_urn: string
  user_id: string | null
  self_participant: LiParticipant
  time_zone: string
  auth_status: 'ok' | 'auth_required'
  last_polled_at: string | null
  created_at: string
  review_status: ReviewStatus
  /** Where the next review page starts; null before the first page and once collected */
  review_cursor: string | null
  review_pages: number
  review_completed_at: string | null
}

export type LinkStatus = 'unlinked' | 'pending' | 'linked' | 'ignored'

export interface ConversationRow {
  urn: string
  mailbox_urn: string
  thread_url: string | null
  group_chat: boolean
  last_activity_at: string
  participants: LiParticipant[]
  contact_urn: string | null
  user_has_replied: boolean
  link_status: LinkStatus
  suggestions: AttioPersonSummary[] | null
  attio_record_id: string | null
  attio_note_id: string | null
  messages_synced_through: string | null
  note_dirty: boolean
  /** Same LinkedIn URL in Attio, or a teammate's link; set by the review's lookups */
  attio_match: AttioPersonSummary | null
  suggested_at: string | null
}

export interface MessageRow {
  urn: string
  conversation_urn: string
  sender_urn: string
  sent_at: string
  text: string
}

export const toIso = (ms: number) => new Date(ms).toISOString()
export const toMs = (iso: string) => Date.parse(iso)

export function messageRow(m: LiMessage): MessageRow {
  return { urn: m.urn, conversation_urn: m.conversationUrn, sender_urn: m.senderUrn, sent_at: toIso(m.sentAt), text: m.text }
}

export function messageFromRow(r: MessageRow): LiMessage {
  return { urn: r.urn, conversationUrn: r.conversation_urn, senderUrn: r.sender_urn, sentAt: toMs(r.sent_at), text: r.text }
}

export function conversationFromRow(r: ConversationRow): LiConversation {
  return {
    urn: r.urn,
    threadUrl: r.thread_url,
    groupChat: r.group_chat,
    lastActivityAt: toMs(r.last_activity_at),
    participants: r.participants,
    latestMessages: [],
  }
}

export function contactOf(r: ConversationRow): LiParticipant | null {
  return r.participants.find((p) => p.urn === r.contact_urn) ?? null
}

/** The card the extension shows for a thread; null when there's no single member to link. */
export function pendingLinkFrom(r: ConversationRow): PendingLink | null {
  const contact = contactOf(r)
  if (!contact) return null
  return {
    conversationUrn: r.urn,
    threadUrl: r.thread_url,
    contact,
    lastActivityAt: toMs(r.last_activity_at),
    suggestions: r.suggestions ?? [],
  }
}
