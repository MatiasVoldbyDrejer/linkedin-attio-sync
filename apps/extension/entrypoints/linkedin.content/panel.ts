import type { AttioPersonSummary, LinkRequest, PendingLink } from '@linkedin-sync/core'
import { sendToBackground } from '../../lib/messages'
import { emptySyncState, getLocal, onLocalChange, updateLocal } from '../../lib/storage'
import { isThreadConversation } from '../../lib/thread'

const SNOOZE_MS = 24 * 60 * 60 * 1000
const SEARCH_DEBOUNCE_MS = 250
const NOTICE_MS = 2500

export type PanelSnapshot =
  | { kind: 'hidden' }
  | { kind: 'notice'; text: string }
  | {
      kind: 'card'
      link: PendingLink
      total: number
      query: string
      results: AttioPersonSummary[] | null
      error: string | null
      busy: boolean
    }

export interface PanelController {
  /** The thread being viewed: its pending link shows first and ignores snoozes (null clears it) */
  prioritize(threadId: string | null): void
  /** conversationUrn of the card on screen, or null */
  shownConversation(): string | null
  onShownChange(listener: (conversationUrn: string | null) => void): () => void
  /** For React's useSyncExternalStore */
  subscribe(listener: () => void): () => void
  getSnapshot(): PanelSnapshot
  search(value: string): void
  link(link: PendingLink, person: AttioPersonSummary): void
  create(link: PendingLink): void
  ignore(link: PendingLink): void
  snooze(link: PendingLink): void
  unmount(): void
}

const hidden: PanelSnapshot = { kind: 'hidden' }

const contactName = (link: PendingLink) => `${link.contact.firstName} ${link.contact.lastName}`.trim()

/**
 * State behind the bottom-right card asking which Attio person an unlinked LinkedIn
 * thread belongs to. The card shows nothing while there's no pending link.
 */
export function createPanel(): PanelController {
  let links: PendingLink[] = []
  let snoozed: Record<string, number> = {}
  let priorityThreadId: string | null = null
  const shownListeners = new Set<(conversationUrn: string | null) => void>()
  const snapshotListeners = new Set<() => void>()
  let snapshot: PanelSnapshot = hidden
  let lastShown: string | null = null
  let currentUrn: string | null = null
  let busy = false
  let error: string | null = null
  let notice: string | null = null
  let query = ''
  let searchResults: AttioPersonSummary[] | null = null
  let searchSeq = 0
  let debounce: ReturnType<typeof setTimeout> | undefined

  const visibleLinks = () => {
    // the thread being viewed always gets its own prompt first, even if it was snoozed elsewhere
    const isFocused = (l: PendingLink) => priorityThreadId !== null && isThreadConversation(l.conversationUrn, priorityThreadId)
    const others = links.filter((l) => !isFocused(l) && (snoozed[l.conversationUrn] ?? 0) < Date.now())
    return [...links.filter(isFocused), ...others]
  }

  function render() {
    renderCard()
    for (const listener of snapshotListeners) listener()
    if (currentUrn !== lastShown) {
      lastShown = currentUrn
      for (const listener of shownListeners) listener(currentUrn)
    }
  }

  function renderCard() {
    if (notice) {
      currentUrn = null
      snapshot = { kind: 'notice', text: notice }
      return
    }
    const visible = visibleLinks()
    const link = visible[0]
    if (!link) {
      currentUrn = null
      snapshot = hidden
      return
    }
    if (link.conversationUrn !== currentUrn) {
      // a fresh card
      currentUrn = link.conversationUrn
      query = ''
      searchResults = null
      error = null
    }
    snapshot = { kind: 'card', link, total: visible.length, query, results: searchResults, error, busy }
  }

  async function act(link: PendingLink, action: LinkRequest['action'], doneText: string) {
    busy = true
    error = null
    render()
    try {
      await sendToBackground({ type: 'link', request: { conversationUrn: link.conversationUrn, action } })
      links = links.filter((l) => l.conversationUrn !== link.conversationUrn)
      notice = doneText
      setTimeout(() => {
        notice = null
        render()
      }, NOTICE_MS)
    } catch (e) {
      error = (e as Error).message
    } finally {
      busy = false
      render()
    }
  }

  async function snoozeLink(link: PendingLink) {
    const now = Date.now()
    snoozed = await updateLocal('snoozed', {}, (current) => ({
      ...Object.fromEntries(Object.entries(current).filter(([, until]) => until > now)),
      [link.conversationUrn]: now + SNOOZE_MS,
    }))
    render()
  }

  function search(value: string) {
    query = value
    clearTimeout(debounce)
    const trimmed = value.trim()
    const seq = ++searchSeq
    if (!trimmed) {
      searchResults = null
      render()
      return
    }
    render()
    debounce = setTimeout(async () => {
      try {
        const people = await sendToBackground({ type: 'searchPeople', query: trimmed })
        if (seq !== searchSeq) return
        searchResults = people
        error = people.length === 0 ? `No Attio people match “${trimmed}”` : null
      } catch (e) {
        if (seq !== searchSeq) return
        error = (e as Error).message
      }
      render()
    }, SEARCH_DEBOUNCE_MS)
  }

  void Promise.all([getLocal('syncState'), getLocal('snoozed')]).then(([state, storedSnoozed]) => {
    links = (state ?? emptySyncState).pendingLinks
    snoozed = storedSnoozed ?? {}
    render()
  })
  const unsubscribeState = onLocalChange('syncState', (state) => {
    links = (state ?? emptySyncState).pendingLinks
    render()
  })
  const unsubscribeSnoozed = onLocalChange('snoozed', (value) => {
    snoozed = value ?? {}
    render()
  })

  return {
    prioritize(threadId) {
      priorityThreadId = threadId
      render()
    },
    shownConversation: () => currentUrn,
    onShownChange(listener) {
      shownListeners.add(listener)
      return () => shownListeners.delete(listener)
    },
    subscribe(listener) {
      snapshotListeners.add(listener)
      return () => snapshotListeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    search,
    link: (link, person) => void act(link, { type: 'link', recordId: person.recordId }, `Synced to ${person.name} in Attio`),
    create: (link) => void act(link, { type: 'create' }, `Created ${contactName(link)} in Attio`),
    ignore: (link) => void act(link, { type: 'ignore' }, 'Won’t ask again'),
    snooze: (link) => void snoozeLink(link),
    unmount() {
      clearTimeout(debounce)
      unsubscribeState()
      unsubscribeSnoozed()
      shownListeners.clear()
      snapshotListeners.clear()
    },
  }
}
