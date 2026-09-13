import type { LiConversation, LiMessage, LiParticipant } from '../linkedin/types'

export interface NoteInput {
  conversation: LiConversation
  messages: LiMessage[]
  /** The person the note is attached to */
  contact: LiParticipant
  timeZone: string
  /** The teammate whose thread this is; keeps titles distinct when several teammates talk to the same person */
  ownerName?: string
  /** Oldest messages are dropped past this count; Attio rejects oversized notes */
  maxMessages?: number
}

export interface RenderedNote {
  title: string
  markdown: string
}

// A message line starting with these would otherwise render as a heading or list
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)([#>*+-]|\d+\.)(\s)/, '$1\\$2$3')
}

export function renderConversationNote({
  conversation,
  messages,
  contact,
  timeZone,
  ownerName,
  maxMessages = 500,
}: NoteInput): RenderedNote {
  const names = new Map(conversation.participants.map((p) => [p.urn, `${p.firstName} ${p.lastName}`.trim()]))
  const sorted = [...messages].sort((a, b) => a.sentAt - b.sentAt)
  const shown = sorted.slice(-maxMessages)

  const day = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'short', day: 'numeric' })
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' })

  const lines: string[] = []
  if (conversation.threadUrl) lines.push(`[Open thread on LinkedIn](${conversation.threadUrl})`, '')
  if (shown.length < sorted.length) lines.push(`_${sorted.length - shown.length} earlier messages omitted_`, '')

  let currentDay = ''
  for (const message of shown) {
    const date = new Date(message.sentAt)
    const dayLabel = day.format(date)
    if (dayLabel !== currentDay) {
      lines.push(`### ${dayLabel}`, '')
      currentDay = dayLabel
    }
    const sender = names.get(message.senderUrn) ?? 'Unknown'
    lines.push(`**${sender}** · ${time.format(date)}`)
    lines.push(...message.text.split('\n').map(escapeLineStart), '')
  }

  const contactName = `${contact.firstName} ${contact.lastName}`.trim()
  const title = ownerName ? `LinkedIn: ${contactName} ↔ ${ownerName}` : `LinkedIn: ${contactName}`
  return { title, markdown: lines.join('\n').trimEnd() }
}
