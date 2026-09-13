import { browser } from 'wxt/browser'
import { emptySyncState, getLocal, getSettings } from './storage'

export async function refreshBadge(): Promise<void> {
  const [settings, state] = await Promise.all([getSettings(), getLocal('syncState')])
  const { health, pendingLinks } = state ?? emptySyncState
  let text = ''
  let color = '#0a66c2'
  if (!settings) {
    text = '?'
    color = '#80868b'
  } else if (health?.status === 'auth_required') {
    text = '!'
    color = '#d93025'
  } else if (health?.status === 'degraded') {
    text = '…'
    color = '#f29900'
  } else if (pendingLinks.length > 0) {
    text = String(pendingLinks.length)
  }
  await browser.action.setBadgeText({ text })
  await browser.action.setBadgeBackgroundColor({ color })
}
