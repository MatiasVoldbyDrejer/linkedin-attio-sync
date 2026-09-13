import { browser } from 'wxt/browser'
import type { AttioPersonSummary, LinkRequest, LinkResponse, ManualSyncResponse, MeResponse } from '@linkedin-sync/core'

/** Messages UI surfaces send to the background, which holds the token. */
export type BackgroundMessage =
  /** Replies once a sync run that started after the message has finished */
  | { type: 'syncNow' }
  | { type: 'observedRequests'; paths: string[] }
  | { type: 'searchPeople'; query: string }
  | { type: 'link'; request: LinkRequest }
  | { type: 'manualSync'; threadId: string }
  /** Runs in the background, which owns Attio's sign-in window and the session */
  | { type: 'signIn' }
  | { type: 'signOut' }
  | { type: 'refreshMe' }
  | { type: 'openOptions' }
  /** null resets to the built-in backend; either way the current session ends */
  | { type: 'setBackendOverride'; backendUrl: string | null }

export interface BackgroundReplies {
  syncNow: null
  observedRequests: null
  searchPeople: AttioPersonSummary[]
  link: LinkResponse
  manualSync: ManualSyncResponse
  signIn: boolean
  signOut: null
  refreshMe: MeResponse | null
  openOptions: null
  setBackendOverride: null
}

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string }

export async function sendToBackground<M extends BackgroundMessage>(message: M): Promise<BackgroundReplies[M['type']]> {
  const reply = (await browser.runtime.sendMessage(message)) as Reply<BackgroundReplies[M['type']]> | undefined
  if (!reply) throw new Error('No response from background')
  if (!reply.ok) throw new Error(reply.error)
  return reply.data
}
