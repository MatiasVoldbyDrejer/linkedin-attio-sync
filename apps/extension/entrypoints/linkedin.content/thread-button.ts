import type { ManualSyncResponse } from '@linkedin-sync/core'
import type { SyncPillState } from '@linkedin-sync/ui/views/sync-pill'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { sendToBackground } from '../../lib/messages'
import { getSettings, onLocalChange, updateLocal } from '../../lib/storage'
import { isThreadConversation, threadIdFromPath } from '../../lib/thread'
import type { PanelController } from './panel'

const DONE_MS = 4000
/** The background writes the card to local state before replying; this is only a backstop */
const CARD_TIMEOUT_MS = 3000

export interface ThreadButtonSnapshot {
  /** null off thread pages, where the pill is hidden */
  threadId: string | null
  signedIn: boolean
  state: SyncPillState
}

export interface ThreadButtonController {
  subscribe(listener: () => void): () => void
  getSnapshot(): ThreadButtonSnapshot
  click(): void
  unmount(): void
}

/** State behind the "Sync to Attio" pill in LinkedIn's thread header (or floating under the card as a fallback). */
export function createThreadButton(ctx: ContentScriptContext, panel: PanelController): ThreadButtonController {
  let threadId: string | null = null
  let signedIn = true
  let state: SyncPillState = { kind: 'idle' }
  /** Bumped on navigation and each click so superseded flows stop touching the UI */
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  let snapshot: ThreadButtonSnapshot = { threadId, signedIn, state }

  function render() {
    snapshot = { threadId, signedIn, state }
    for (const listener of listeners) listener()
  }

  function setState(next: SyncPillState) {
    clearTimeout(timer)
    state = next
    render()
  }

  const isCurrent = (gen: number) => gen === generation

  async function handle(response: ManualSyncResponse, id: string, gen: number) {
    switch (response.status) {
      case 'linked':
        // the backend rewrote the note in the last round
        setState({ kind: 'done', label: 'Synced to Attio' })
        timer = setTimeout(() => setState({ kind: 'idle' }), DONE_MS)
        return
      case 'needs_link': {
        await updateLocal('snoozed', {}, (current) =>
          Object.fromEntries(Object.entries(current).filter(([urn]) => !isThreadConversation(urn, id))),
        )
        if (!isCurrent(gen)) return
        panel.prioritize(id)
        const shown = panel.shownConversation()
        if (shown && isThreadConversation(shown, id)) return setState({ kind: 'picking' })
        // onShownChange flips this to picking, which also clears the timer
        setState({ kind: 'awaitingCard' })
        timer = setTimeout(() => {
          if (isCurrent(gen)) setState({ kind: 'note', tone: 'error', text: 'Couldn’t load the Attio prompt. Try again.' })
        }, CARD_TIMEOUT_MS)
        return
      }
      case 'searching':
        return setState({ kind: 'note', tone: 'muted', text: 'LinkedIn didn’t answer. Try again.' })
      case 'not_found':
        return setState({ kind: 'note', tone: 'muted', text: 'Couldn’t find this conversation' })
      case 'unsupported':
        return setState({ kind: 'note', tone: 'muted', text: response.message })
    }
  }

  // LinkedIn is an SPA: thread switches don't reload the content script
  function onLocationChange(pathname: string) {
    const next = threadIdFromPath(pathname)
    if (next === threadId) return
    threadId = next
    generation++
    setState({ kind: 'idle' })
    panel.prioritize(next)
  }

  function click() {
    // signed out: the welcome page has the sign-in button
    if (!signedIn) return void sendToBackground({ type: 'openOptions' }).catch(() => {})
    // the URL has committed by the time anyone clicks, so trust it over the last event
    onLocationChange(location.pathname)
    const id = threadId
    if (!id) return
    const gen = ++generation
    setState({ kind: 'busy', label: 'Syncing…' })
    void (async () => {
      try {
        const response = await sendToBackground({ type: 'manualSync', threadId: id })
        if (isCurrent(gen)) await handle(response, id, gen)
      } catch (error) {
        if (isCurrent(gen)) setState({ kind: 'note', tone: 'error', text: (error as Error).message })
      }
    })()
  }

  const offShown = panel.onShownChange((urn) => {
    if (threadId === null) return
    const mine = urn !== null && isThreadConversation(urn, threadId)
    // also when opening a thread that was already waiting for a match
    if (mine && (state.kind === 'awaitingCard' || state.kind === 'idle')) setState({ kind: 'picking' })
    // linked, ignored or snoozed from the card; dropping focus lets a snooze hide it
    else if (!mine && state.kind === 'picking') {
      panel.prioritize(null)
      setState({ kind: 'idle' })
    }
  })

  // WXT fires this from the Navigation API's `navigate` event, before `location` updates,
  // so the destination has to come from the event
  ctx.addEventListener(window, 'wxt:locationchange', (event) => onLocationChange(event.newUrl.pathname))
  onLocationChange(location.pathname)
  render()

  const offSettings = onLocalChange('settings', (settings) => {
    signedIn = Boolean(settings?.token)
    render()
  })
  void getSettings().then((settings) => {
    signedIn = settings !== null
    render()
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    click,
    unmount() {
      generation++
      clearTimeout(timer)
      offShown()
      offSettings()
      listeners.clear()
    },
  }
}
