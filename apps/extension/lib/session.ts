import { browser } from 'wxt/browser'
import { emptySyncState, removeLocal, setLocal } from './storage'

export const SYNC_ALARM = 'sync'
export const SESSION_EXPIRED = 'Your session ended. Sign in again to keep syncing.'

/** Forgets the signed-in user's token and data and stops syncing until someone signs in. */
export async function endSession(notice: string | null): Promise<void> {
  await browser.alarms.clear(SYNC_ALARM)
  // results and the card list belong to the previous user
  await removeLocal('settings', 'me', 'pendingResults')
  await setLocal('syncState', emptySyncState)
  if (notice) await setLocal('authNotice', notice)
  else await removeLocal('authNotice')
}
