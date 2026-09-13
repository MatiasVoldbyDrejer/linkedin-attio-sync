import { describe, expect, it } from 'vitest'
import { renderConversationNote } from '../src/attio/note'
import type { LiConversation, LiParticipant } from '../src/linkedin/types'

const self: LiParticipant = { urn: 'urn:li:fsd_profile:SELF', firstName: 'Sam', lastName: 'Rivera', headline: null, profileUrl: null }
const ada: LiParticipant = { urn: 'urn:li:fsd_profile:ADA', firstName: 'Ada', lastName: 'Lovelace', headline: 'Analyst', profileUrl: 'https://www.linkedin.com/in/ada' }

const conversation: LiConversation = {
  urn: 'urn:li:msg_conversation:(urn:li:fsd_profile:SELF,2-x)',
  threadUrl: 'https://www.linkedin.com/messaging/thread/2-x/',
  groupChat: false,
  lastActivityAt: 0,
  participants: [self, ada],
  latestMessages: [],
}

const msg = (senderUrn: string, iso: string, text: string) => ({
  urn: `urn:li:msg_message:${iso}`,
  conversationUrn: conversation.urn,
  senderUrn,
  sentAt: Date.parse(iso),
  text,
})

describe('renderConversationNote', () => {
  it('groups by day in the given time zone, oldest first', () => {
    const note = renderConversationNote({
      conversation,
      contact: ada,
      timeZone: 'Europe/Copenhagen',
      messages: [
        msg(self.urn, '2026-09-11T22:30:00Z', 'Sounds good'),
        msg(ada.urn, '2026-09-11T09:00:00Z', 'Hey!\n- point one'),
      ],
    })
    expect(note.title).toBe('LinkedIn: Ada Lovelace')
    expect(note.markdown).toBe(
      [
        '[Open thread on LinkedIn](https://www.linkedin.com/messaging/thread/2-x/)',
        '',
        '### Sep 11, 2026',
        '',
        '**Ada Lovelace** · 11:00',
        'Hey!',
        '\\- point one',
        '',
        '### Sep 12, 2026',
        '',
        '**Sam Rivera** · 00:30',
        'Sounds good',
      ].join('\n'),
    )
  })

  it("names the teammate whose thread it is, so teammates' notes on one person stay apart", () => {
    const note = renderConversationNote({ conversation, contact: ada, timeZone: 'UTC', messages: [], ownerName: 'Sam' })
    expect(note.title).toBe('LinkedIn: Ada Lovelace ↔ Sam')
  })

  it('drops the oldest messages past the cap and says so', () => {
    const messages = [1, 2, 3].map((d) => msg(ada.urn, `2026-09-0${d}T12:00:00Z`, `m${d}`))
    const note = renderConversationNote({ conversation, contact: ada, timeZone: 'UTC', messages, maxMessages: 2 })
    expect(note.markdown).toContain('_1 earlier messages omitted_')
    expect(note.markdown).not.toContain('m1')
  })
})
