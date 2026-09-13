import '../../assets/tailwind.css'
import { SidePanelView } from '@linkedin-sync/ui/views/side-panel-view'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { useLocal, useSettings } from '../../hooks/use-local'
import { sendToBackground } from '../../lib/messages'
import { openReview } from '../../lib/review'
import { emptySyncState } from '../../lib/storage'
import { availableUpdate } from '../../lib/ui'

/** Opened from the toolbar button (see background.ts); it stays open across tabs. */
function SidePanel() {
  const settings = useSettings()
  const syncState = useLocal('syncState')
  const me = useLocal('me')
  const notice = useLocal('authNotice')
  const [syncing, setSyncing] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)

  useEffect(() => {
    // the cached name, LinkedIn account and latest version can be stale; the panel can stay
    // open for hours, so refresh whenever it's shown again too
    const refresh = () => {
      if (document.visibilityState === 'visible') void sendToBackground({ type: 'refreshMe' }).catch(() => {})
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  const className = 'h-dvh'

  if (settings === undefined || !syncState.loaded || !me.loaded || !notice.loaded) {
    return <SidePanelView status="loading" className={className} />
  }

  if (!settings) {
    return (
      <SidePanelView
        status="signedOut"
        className={className}
        notice={notice.value}
        signingIn={signingIn}
        signInError={signInError}
        onSignIn={async () => {
          setSigningIn(true)
          setSignInError(null)
          try {
            // the background runs Attio's sign-in window and stores the session
            await sendToBackground({ type: 'signIn' })
          } catch (error) {
            setSignInError((error as Error).message)
          } finally {
            setSigningIn(false)
          }
        }}
      />
    )
  }

  const state = syncState.value ?? emptySyncState
  return (
    <SidePanelView
      status="signedIn"
      className={className}
      me={me.value}
      update={availableUpdate(me.value)}
      health={state.health}
      lastSyncAt={state.lastSyncAt}
      lastError={state.lastError}
      pendingCount={state.pendingLinks.length}
      syncing={syncing}
      onSyncNow={async () => {
        setSyncing(true)
        try {
          await sendToBackground({ type: 'syncNow' })
        } finally {
          setSyncing(false)
        }
      }}
      onSignOut={() => void sendToBackground({ type: 'signOut' })}
      onOpenGuide={() => void browser.runtime.openOptionsPage()}
      // a cached `me` from an older backend has no reviewStatus: no prompt then
      review={me.value?.reviewStatus ? { status: me.value.reviewStatus, onOpen: () => void openReview() } : null}
    />
  )
}

createRoot(document.getElementById('root')!).render(<SidePanel />)
