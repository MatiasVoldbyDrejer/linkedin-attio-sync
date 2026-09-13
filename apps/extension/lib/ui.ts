import { browser } from 'wxt/browser'
import type { MeResponse } from '@linkedin-sync/core'
import type { UpdateInfo } from '@linkedin-sync/ui/views/shared'

/** Shared bits of the side panel and the options/welcome page. */

/** True when `latest` is a higher dotted version than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/** Nudge for teammates on an unpacked build that's behind; null when up to date. */
export function availableUpdate(me: MeResponse | undefined): UpdateInfo | null {
  if (!me || !isNewerVersion(me.extension.latestVersion, browser.runtime.getManifest().version)) return null
  return { version: me.extension.latestVersion, downloadUrl: me.extension.downloadUrl }
}
