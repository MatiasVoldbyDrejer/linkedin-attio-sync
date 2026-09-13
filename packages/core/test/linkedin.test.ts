import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildRequest,
  defaultRequestConfig,
  LinkedInParseError,
  parseConversations,
  parseConversationsById,
  parseInboxPage,
  parseMe,
  parseMessages,
  scrubPayload,
} from '../src/linkedin'

/**
 * Every scrubbed capture in test/fixtures (including ones the self-heal agent adds
 * under fixtures/incidents) must parse. Fixture shape: see linkedin-capture-*.json.
 */
interface CaptureFixture {
  mailboxUrn: string
  me?: unknown
  conversations?: unknown
  conversationsById?: unknown
  messages?: unknown
}

function loadFixtures(dir: string): [string, CaptureFixture][] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return loadFixtures(path)
    return entry.name.endsWith('.json') ? [[path, JSON.parse(readFileSync(path, 'utf8')) as CaptureFixture]] : []
  })
}

const fixtures = loadFixtures(join(import.meta.dirname, 'fixtures'))

describe.each(fixtures)('capture %s', (_path, fixture) => {
  it.runIf(fixture.me)('parses /me into the mailbox owner', () => {
    const { mailboxUrn, self } = parseMe(fixture.me)
    expect(mailboxUrn).toBe(fixture.mailboxUrn)
    expect(self.firstName).not.toBe('')
  })

  it.runIf(fixture.conversations)('parses the inbox', () => {
    const { conversations, syncToken } = parseConversations(fixture.conversations)
    expect(conversations.length).toBeGreaterThan(0)
    expect(syncToken).toBeTruthy()
    for (const c of conversations) {
      expect(c.urn).toContain(fixture.mailboxUrn)
      expect(c.participants.some((p) => p.urn === fixture.mailboxUrn)).toBe(true)
      for (const m of c.latestMessages) expect(m.conversationUrn).toBe(c.urn)
    }
  })

  it.runIf(fixture.conversationsById)('parses a conversation lookup', () => {
    const conversations = parseConversationsById(fixture.conversationsById)
    expect(conversations.length).toBeGreaterThan(0)
    for (const c of conversations) expect(c.participants.some((p) => p.urn === fixture.mailboxUrn)).toBe(true)
  })

  it.runIf(fixture.messages)('parses a thread', () => {
    const { messages, participants } = parseMessages(fixture.messages)
    expect(messages.length).toBeGreaterThan(0)
    for (const m of messages) {
      expect(m.sentAt).toBeGreaterThan(Date.UTC(2020, 0, 1))
      expect(m.text).not.toBe('')
    }
    expect(participants.length).toBeGreaterThan(0)
  })
})

describe('parse errors', () => {
  it('reports the path that changed', () => {
    const [, fixture] = fixtures[0]!
    const broken = structuredClone(fixture.conversations) as {
      data: { messengerConversationsBySyncToken: { elements: { lastActivityAt?: unknown }[] } }
    }
    delete broken.data.messengerConversationsBySyncToken.elements[0]!.lastActivityAt
    try {
      parseConversations(broken)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(LinkedInParseError)
      expect((error as LinkedInParseError).issues[0]!.path).toBe(
        'data.messengerConversationsBySyncToken.elements.0.lastActivityAt',
      )
    }
  })

  it('rejects a response without a conversations collection', () => {
    expect(() => parseConversations({ data: {} })).toThrow(LinkedInParseError)
  })
})

describe('parseConversationsById', () => {
  it('reads the bare array a conversationIds lookup returns', () => {
    // same Conversation entity as the inbox, minus embedded messages (verified live 2026-09-13)
    const source = fixtures.map(([, f]) => f).find((f) => f.conversations)!
    const inbox = source.conversations as { data: { messengerConversationsBySyncToken: { elements: Record<string, unknown>[] } } }
    const { messages: _embedded, ...conversation } = inbox.data.messengerConversationsBySyncToken.elements[0]!

    const [parsed] = parseConversationsById({ data: { messengerConversationsByIds: [conversation] } })
    expect(parsed!.urn).toBe(conversation.entityUrn)
    expect(parsed!.participants.length).toBeGreaterThan(1)
    expect(parsed!.latestMessages).toEqual([])
  })

  it('rejects a lookup without results', () => {
    expect(() => parseConversationsById({ data: {} })).toThrow(LinkedInParseError)
  })
})

describe('parseInboxPage', () => {
  // same Conversation entity as the sync-token inbox, under a category query with a cursor (verified live 2026-09-13)
  const source = fixtures.map(([, f]) => f).find((f) => f.conversations)!
  const inbox = source.conversations as { data: { messengerConversationsBySyncToken: { elements: unknown[] } } }
  const page = (metadata: unknown) => ({
    data: { messengerConversationsByCategoryQuery: { elements: inbox.data.messengerConversationsBySyncToken.elements, metadata } },
  })

  it('reads a page and the cursor for the next one', () => {
    const { conversations, nextCursor } = parseInboxPage(page({ nextCursor: 'c2VxPTI1==' }))
    expect(conversations).toHaveLength(inbox.data.messengerConversationsBySyncToken.elements.length)
    expect(nextCursor).toBe('c2VxPTI1==')
  })

  it('treats a page without a cursor as the last one', () => {
    expect(parseInboxPage(page({})).nextCursor).toBeNull()
  })
})

describe('buildRequest', () => {
  it('pages the inbox by cursor', () => {
    const { url } = buildRequest(defaultRequestConfig, 'inboxPageAfter', {
      mailboxUrn: 'urn:li:fsd_profile:ACoA1',
      cursor: 'c2VxPTI1==',
    })
    expect(url).toContain('count:25,mailboxUrn:urn%3Ali%3Afsd_profile%3AACoA1,nextCursor:c2VxPTI1%3D%3D)')
  })

  it('encodes rest.li parens inside variables', () => {
    const { url, headers } = buildRequest(defaultRequestConfig, 'messages', {
      conversationUrn: 'urn:li:msg_conversation:(urn:li:fsd_profile:ACoA1,2-abc==)',
    })
    expect(url).toContain('variables=(conversationUrn:urn%3Ali%3Amsg_conversation%3A%28urn%3Ali%3Afsd_profile%3AACoA1%2C2-abc%3D%3D%29)')
    expect(headers.accept).toBe('application/graphql')
  })

  it('refuses to build with a missing param', () => {
    expect(() => buildRequest(defaultRequestConfig, 'conversations')).toThrow(/mailboxUrn/)
  })
})

describe('scrubPayload', () => {
  it('keeps structure and cross-references but drops personal text', () => {
    const payload = {
      _type: 'com.linkedin.messenger.Message',
      sender: { hostIdentityUrn: 'urn:li:fsd_profile:ACoAAReal123' },
      conversation: { entityUrn: 'urn:li:msg_conversation:(urn:li:fsd_profile:ACoAAReal123,2-thread)' },
      body: { text: 'Hi Ada, lunch on Friday?' },
      deliveredAt: 1789237365532,
      state: 'ACCEPTED',
    }
    const scrubbed = scrubPayload(payload) as typeof payload
    expect(scrubbed._type).toBe(payload._type)
    expect(scrubbed.state).toBe('ACCEPTED')
    expect(scrubbed.deliveredAt).toBe(payload.deliveredAt)
    expect(JSON.stringify(scrubbed)).not.toMatch(/Ada|Real123|lunch/)
    expect(scrubbed.conversation.entityUrn).toContain(scrubbed.sender.hostIdentityUrn.split(':').pop()!)
  })
})
