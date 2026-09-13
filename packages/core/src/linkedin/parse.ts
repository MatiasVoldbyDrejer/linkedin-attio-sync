import { z } from 'zod'
import type { RequestName } from './requests'
import type { ConversationsPage, InboxPage, LiConversation, LiMessage, LiParticipant, MessagesPage } from './types'

export class LinkedInParseError extends Error {
  constructor(
    readonly request: RequestName,
    readonly issues: { path: string; message: string }[],
  ) {
    super(`LinkedIn "${request}" response did not match schema: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`)
  }
}

// Schemas only describe fields we read; everything else LinkedIn adds is ignored.

const attributedText = z.object({ text: z.string() })

const member = z.object({
  profileUrl: z.string().nullish(),
  firstName: attributedText,
  lastName: attributedText,
  headline: attributedText.nullish(),
})

const participant = z.object({
  hostIdentityUrn: z.string(),
  participantType: z.object({ member: member.nullish() }).nullish(),
})

const message = z.object({
  entityUrn: z.string(),
  deliveredAt: z.number(),
  body: attributedText.nullish(),
  renderContentFallbackText: z.string().nullish(),
  renderContent: z.array(z.unknown()).nullish(),
  sender: participant,
  conversation: z.object({ entityUrn: z.string() }),
})

const conversation = z.object({
  entityUrn: z.string(),
  conversationUrl: z.string().nullish(),
  groupChat: z.boolean(),
  lastActivityAt: z.number(),
  conversationParticipants: z.array(participant),
  messages: z.object({ elements: z.array(message) }).nullish(),
})

/**
 * Results sit under keys like `messengerConversationsBySyncToken` or
 * `messengerConversationsByIds`; the suffix depends on the query, so match the prefix.
 */
function dataEntry<T extends z.ZodTypeAny>(prefix: string, schema: T) {
  return z.object({ data: z.record(z.string(), z.unknown()) }).transform((res, ctx): z.output<T> => {
    const key = Object.keys(res.data).find((k) => k.startsWith(prefix))
    if (!key) {
      ctx.addIssue({ code: 'custom', path: ['data', prefix], message: `no result starting with ${prefix}` })
      return z.NEVER
    }
    const parsed = schema.safeParse(res.data[key])
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['data', key, ...issue.path] } as never)
      return z.NEVER
    }
    return parsed.data
  })
}

const conversationsResponse = dataEntry(
  'messengerConversations',
  z.object({
    elements: z.array(conversation),
    metadata: z.object({ newSyncToken: z.string().nullish() }).nullish(),
  }),
)

const inboxPageResponse = dataEntry(
  'messengerConversations',
  z.object({
    elements: z.array(conversation),
    metadata: z.object({ nextCursor: z.string().nullish() }).nullish(),
  }),
)

// a conversationIds lookup returns a bare array rather than a collection
const conversationsByIdResponse = dataEntry('messengerConversations', z.array(conversation))

const messagesResponse = dataEntry(
  'messengerMessages',
  z.object({
    elements: z.array(message),
    metadata: z.object({ deletedUrns: z.array(z.string()).nullish() }).nullish(),
  }),
)

const meResponse = z.object({
  included: z.array(z.looseObject({ $type: z.string() })),
})

const miniProfile = z.object({
  dashEntityUrn: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  occupation: z.string().nullish(),
  publicIdentifier: z.string().nullish(),
})

function run<T extends z.ZodTypeAny>(request: RequestName, schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new LinkedInParseError(
      request,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }
  return result.data
}

function toParticipant(p: z.infer<typeof participant>): LiParticipant | null {
  const m = p.participantType?.member
  // company pages and LinkedIn system senders have no member info
  if (!m) return null
  return {
    urn: p.hostIdentityUrn,
    firstName: m.firstName.text,
    lastName: m.lastName.text,
    headline: m.headline?.text ?? null,
    profileUrl: m.profileUrl ?? null,
  }
}

function toMessage(m: z.infer<typeof message>): LiMessage {
  const text = m.body?.text || m.renderContentFallbackText || (m.renderContent?.length ? '[attachment]' : '')
  return {
    urn: m.entityUrn,
    conversationUrn: m.conversation.entityUrn,
    senderUrn: m.sender.hostIdentityUrn,
    sentAt: m.deliveredAt,
    text,
  }
}

function toConversation(c: z.infer<typeof conversation>): LiConversation {
  return {
    urn: c.entityUrn,
    threadUrl: c.conversationUrl ?? null,
    groupChat: c.groupChat,
    lastActivityAt: c.lastActivityAt,
    participants: c.conversationParticipants.map(toParticipant).filter((p) => p !== null),
    latestMessages: (c.messages?.elements ?? []).map(toMessage),
  }
}

export function parseMe(body: unknown): { mailboxUrn: string; self: LiParticipant } {
  const { included } = run('me', meResponse, body)
  const profile = included.find((i) => i.$type.endsWith('MiniProfile'))
  const mini = run('me', miniProfile, profile)
  return {
    mailboxUrn: mini.dashEntityUrn,
    self: {
      urn: mini.dashEntityUrn,
      firstName: mini.firstName,
      lastName: mini.lastName,
      headline: mini.occupation ?? null,
      profileUrl: mini.publicIdentifier ? `https://www.linkedin.com/in/${mini.publicIdentifier}` : null,
    },
  }
}

export function parseConversations(body: unknown): ConversationsPage {
  const { elements, metadata } = run('conversations', conversationsResponse, body)
  return { conversations: elements.map(toConversation), syncToken: metadata?.newSyncToken ?? null }
}

/** One page of the primary inbox, newest first; `nextCursor` is null on the last page. */
export function parseInboxPage(body: unknown, request: 'inboxPage' | 'inboxPageAfter' = 'inboxPage'): InboxPage {
  const { elements, metadata } = run(request, inboxPageResponse, body)
  return { conversations: elements.map(toConversation), nextCursor: metadata?.nextCursor ?? null }
}

export function parseConversationsById(body: unknown): LiConversation[] {
  return run('conversationById', conversationsByIdResponse, body).map(toConversation)
}

export function parseMessages(body: unknown): MessagesPage {
  const { elements, metadata } = run('messages', messagesResponse, body)
  const participants = new Map<string, LiParticipant>()
  for (const m of elements) {
    const p = toParticipant(m.sender)
    if (p) participants.set(p.urn, p)
  }
  return {
    messages: elements.map(toMessage),
    participants: [...participants.values()],
    deletedUrns: metadata?.deletedUrns ?? [],
  }
}
