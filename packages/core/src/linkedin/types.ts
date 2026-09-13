/** Normalized LinkedIn messaging entities, independent of Voyager's response shape. */

export interface LiParticipant {
  /** urn:li:fsd_profile:ACoA… */
  urn: string
  firstName: string
  lastName: string
  headline: string | null
  /** https://www.linkedin.com/in/<vanity> when LinkedIn exposes it */
  profileUrl: string | null
}

export interface LiMessage {
  /** urn:li:msg_message:(…) */
  urn: string
  conversationUrn: string
  senderUrn: string
  /** epoch milliseconds */
  sentAt: number
  text: string
}

export interface LiConversation {
  /** urn:li:msg_conversation:(urn:li:fsd_profile:<mailbox>,2-…) */
  urn: string
  threadUrl: string | null
  groupChat: boolean
  /** epoch milliseconds */
  lastActivityAt: number
  /** Everyone in the thread, including the mailbox owner */
  participants: LiParticipant[]
  /** LinkedIn embeds only the most recent message(s) in the inbox listing */
  latestMessages: LiMessage[]
}

export interface ConversationsPage {
  conversations: LiConversation[]
  syncToken: string | null
}

export interface InboxPage {
  conversations: LiConversation[]
  /** Fetches the next (older) page; null on the last one */
  nextCursor: string | null
}

export interface MessagesPage {
  messages: LiMessage[]
  participants: LiParticipant[]
  deletedUrns: string[]
}
