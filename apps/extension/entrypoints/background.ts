import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { refreshMe, signIn, signOut } from '../lib/auth'
import { refreshBadge } from '../lib/badge'
import { BackendClient, describeBackendError, isUnauthorized, SIGN_IN_MESSAGE } from '../lib/backend'
import type { BackgroundMessage, BackgroundReplies, Reply } from '../lib/messages'
import { endSession, SESSION_EXPIRED, SYNC_ALARM } from '../lib/session'
import { openReview } from '../lib/review'
import { emptySyncState, getSettings, onLocalChange, removeLocal, setLocal, updateLocal, type Settings } from '../lib/storage'
import { runFreshSync, runManualSync, runSync } from '../lib/sync'

const MAX_OBSERVED_REQUESTS = 20

async function backend(): Promise<BackendClient> {
  const settings = await getSettings()
  if (!settings) throw new Error(SIGN_IN_MESSAGE)
  return new BackendClient(settings)
}

/** After a sign-in: the review of recent conversations, unless it was already done. */
async function openReviewIfPending(): Promise<void> {
  const settings = await getSettings()
  if (!settings) return
  try {
    const review = await new BackendClient(settings).review()
    if (review.status !== 'done') await openReview()
  } catch {
    // the side panel still offers the review
  }
}

async function handle(message: BackgroundMessage): Promise<BackgroundReplies[BackgroundMessage['type']]> {
  switch (message.type) {
    case 'syncNow':
      await runFreshSync()
      return null
    case 'observedRequests':
      await updateLocal('observedRequests', [], (current) =>
        [...new Set([...message.paths, ...current])].slice(0, MAX_OBSERVED_REQUESTS),
      )
      return null
    case 'searchPeople':
      return (await backend()).searchPeople(message.query)
    case 'link': {
      const response = await (await backend()).link(message.request)
      await updateLocal('syncState', emptySyncState, (state) => ({
        ...state,
        pendingLinks: state.pendingLinks.filter((l) => l.conversationUrn !== message.request.conversationUrn),
      }))
      void runSync()
      return response
    }
    case 'manualSync':
      try {
        return await runManualSync(message.threadId)
      } catch (error) {
        if (isUnauthorized(error)) throw error
        throw new Error(describeBackendError(error))
      }
    case 'signIn':
      return signIn()
    case 'signOut':
      await signOut()
      return null
    case 'refreshMe':
      return refreshMe()
    case 'openOptions':
      await browser.runtime.openOptionsPage()
      return null
    case 'setBackendOverride':
      // a token is only valid for the backend that issued it
      await endSession(null)
      if (message.backendUrl) await setLocal('backendOverride', message.backendUrl)
      else await removeLocal('backendOverride')
      return null
  }
}

export default defineBackground(() => {
  // the toolbar button opens the side panel, like wallet extensions do, instead of a popup
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

  browser.runtime.onInstalled.addListener(({ reason }) => {
    // the options page doubles as the welcome and sign-in page
    if (reason === 'install') void browser.runtime.openOptionsPage()
    void runSync()
  })
  browser.runtime.onStartup.addListener(() => void runSync())
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) void runSync()
  })

  onLocalChange('settings', () => {
    void runSync()
    void refreshBadge()
  })
  onLocalChange('syncState', () => void refreshBadge())
  void refreshBadge()

  // oldValue tells a fresh sign-in apart from a token refresh, even if the worker just woke up
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes.settings
    if (area !== 'local' || !change) return
    const before = (change.oldValue as Settings | undefined)?.token
    const after = (change.newValue as Settings | undefined)?.token
    if (after && !before) void openReviewIfPending()
  })

  browser.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
    handle(message).then(
      (data) => sendResponse({ ok: true, data } satisfies Reply<unknown>),
      async (error: Error) => {
        let text = error.message
        if (isUnauthorized(error)) {
          await endSession(SESSION_EXPIRED)
          text = SIGN_IN_MESSAGE
        }
        sendResponse({ ok: false, error: text } satisfies Reply<unknown>)
      },
    )
    return true // keep the channel open for the async reply
  })
})
