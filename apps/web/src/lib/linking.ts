import {
  AttioClient,
  AttioError,
  linkedInVanity,
  renderConversationNote,
  type AttioPersonSummary,
  type LinkRequest,
  type LinkResponse,
  type LiParticipant,
} from '@linkedin-sync/core'
import { contactOf, conversationFromRow, messageFromRow, type AccountRow, type ConversationRow, type UserRow } from './rows'
import {
  getAccountForUser,
  getConversation,
  linkedConversationWithContact,
  listMessages,
  updateConversation,
} from './store'

const OVERSIZED_NOTE_MAX_MESSAGES = 100

export class NotFoundError extends Error {}

export function attio(): AttioClient {
  const token = process.env.ATTIO_API_TOKEN
  if (!token) throw new Error('Missing ATTIO_API_TOKEN')
  return new AttioClient(token)
}

/** The contact's Attio person by LinkedIn URL, plus fuzzy name matches other than that one. */
export async function findPeople(
  contact: LiParticipant,
  limit = 5,
): Promise<{ match: AttioPersonSummary | null; suggestions: AttioPersonSummary[] }> {
  const client = attio()
  const [byProfile, byName] = await Promise.all([
    contact.profileUrl ? client.findPersonByLinkedIn(contact.profileUrl) : null,
    client.searchPeople(`${contact.firstName} ${contact.lastName}`.trim(), limit),
  ])
  // the search result carries the image and emails the profile lookup doesn't
  const match: AttioPersonSummary | null = byProfile
    ? (byName.find((p) => p.recordId === byProfile.recordId) ?? { recordId: byProfile.recordId, name: byProfile.name, image: null, emails: [] })
    : null
  return { match, suggestions: byName.filter((p) => p.recordId !== match?.recordId) }
}

async function suggestPeople(contact: LiParticipant): Promise<AttioPersonSummary[]> {
  const { match, suggestions } = await findPeople(contact)
  return match ? [match, ...suggestions] : suggestions
}

/** The Attio record a link or create decision lands on, carrying the contact's LinkedIn URL either way. */
export async function resolvePerson(
  contact: LiParticipant,
  action: { type: 'link'; recordId: string } | { type: 'create' },
): Promise<string> {
  const client = attio()
  if (action.type === 'create') {
    return (await client.createPerson({ firstName: contact.firstName, lastName: contact.lastName, linkedin: contact.profileUrl })).recordId
  }
  if (contact.profileUrl) {
    const person = await client.getPerson(action.recordId)
    const current = person.linkedin ? linkedInVanity(person.linkedin) : null
    if (current !== linkedInVanity(contact.profileUrl)) await client.setPersonLinkedIn(action.recordId, contact.profileUrl)
  }
  return action.recordId
}

/**
 * An unlinked 1:1 thread needs a person. Reuse any earlier decision for the same LinkedIn
 * member, the teammate's own or another teammate's, since it's the same person; otherwise ask.
 */
export async function requestLinkDecision(conversation: ConversationRow): Promise<void> {
  const contact = contactOf(conversation)
  if (!contact) return

  const sibling = await linkedConversationWithContact(contact.urn)
  if (sibling?.attio_record_id) {
    await updateConversation(conversation.urn, {
      link_status: 'linked',
      attio_record_id: sibling.attio_record_id,
      note_dirty: true,
    })
    return
  }

  let suggestions: AttioPersonSummary[] = []
  try {
    suggestions = await suggestPeople(contact)
  } catch (error) {
    // the prompt still works without suggestions; the user can search
    console.error('[linking] Attio suggestions failed', error)
  }
  await updateConversation(conversation.urn, { link_status: 'pending', suggestions })
}

export async function linkConversation(req: LinkRequest, user: UserRow): Promise<LinkResponse> {
  const account = await getAccountForUser(user.id)
  const conversation = await getConversation(req.conversationUrn)
  // teammates can only decide about their own threads
  if (!account || !conversation || conversation.mailbox_urn !== account.mailbox_urn) {
    throw new NotFoundError(`Unknown conversation ${req.conversationUrn}`)
  }

  if (req.action.type === 'ignore') {
    await updateConversation(conversation.urn, { link_status: 'ignored', suggestions: null })
    return { recordId: null, noteId: null }
  }

  const contact = contactOf(conversation)
  if (!contact) throw new Error('Only 1:1 conversations with a LinkedIn member can be linked')

  const recordId = await resolvePerson(contact, req.action)
  const linked: ConversationRow = { ...conversation, link_status: 'linked', attio_record_id: recordId, suggestions: null }
  await updateConversation(conversation.urn, { link_status: 'linked', attio_record_id: recordId, suggestions: null, note_dirty: true })
  const noteId = await syncNote(account, linked)
  return { recordId, noteId }
}

/** Renders the whole thread and writes it to the person's note, creating it if needed. */
export async function syncNote(account: AccountRow, conversation: ConversationRow): Promise<string> {
  const contact = contactOf(conversation)
  const recordId = conversation.attio_record_id
  if (!contact || !recordId) throw new Error(`Conversation ${conversation.urn} is not linked to a person`)

  const client = attio()
  const messages = (await listMessages(conversation.urn)).map(messageFromRow)

  const write = async (maxMessages?: number): Promise<string> => {
    const note = renderConversationNote({
      conversation: conversationFromRow(conversation),
      messages,
      contact,
      timeZone: account.time_zone,
      ownerName: account.self_participant.firstName,
      maxMessages,
    })
    if (conversation.attio_note_id) {
      try {
        await client.updateNote(conversation.attio_note_id, note)
        return conversation.attio_note_id
      } catch (error) {
        // deleted in Attio: start a fresh note rather than failing forever
        if (!(error instanceof AttioError && error.status === 404)) throw error
      }
    }
    return client.createNote({ recordId, ...note })
  }

  let noteId: string
  try {
    noteId = await write()
  } catch (error) {
    if (!(error instanceof AttioError && error.status === 413)) throw error
    noteId = await write(OVERSIZED_NOTE_MAX_MESSAGES)
  }
  await updateConversation(conversation.urn, { attio_note_id: noteId, note_dirty: false })
  return noteId
}
