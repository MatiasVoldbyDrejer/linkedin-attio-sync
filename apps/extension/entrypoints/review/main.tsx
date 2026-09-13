import '../../assets/tailwind.css'
import type { ReviewDecision, ReviewResponse } from '@linkedin-sync/core'
import { ReviewView, type ReviewViewState } from '@linkedin-sync/ui/views/review-view'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { useSettings } from '../../hooks/use-local'
import { refreshMe, signIn } from '../../lib/auth'
import { BackendClient, BackendError, describeBackendError } from '../../lib/backend'
import { sendToBackground } from '../../lib/messages'

const POLL_MS = 3000
/** Polls without progress before nudging the sync loop again */
const STALLED_POLLS = 3

type Phase =
  | { kind: 'loading' }
  | { kind: 'collecting'; collected: number; target: number }
  | { kind: 'ready'; review: ReviewResponse; submitting: boolean; error: string | null }
  | { kind: 'done'; synced: number; failed: number; alreadyDone: boolean }
  | { kind: 'error'; message: string }

// collection runs in the background sync loop; a nudge starts it now instead of at the next alarm
const nudgeSync = () => void sendToBackground({ type: 'syncNow' }).catch(() => {})

/** Opened after a first sign-in (see background.ts) and from the side panel until it's done. */
function Review() {
  const settings = useSettings()
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    const client = new BackendClient(settings)
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastCollected = -1
    let stalled = 0

    const load = async () => {
      try {
        const review = await client.review()
        if (!live) return
        if (review.status === 'collecting') {
          stalled = review.collected === lastCollected ? stalled + 1 : 0
          lastCollected = review.collected
          if (stalled >= STALLED_POLLS) {
            stalled = 0
            nudgeSync()
          }
          setPhase({ kind: 'collecting', collected: review.collected, target: review.target })
          timer = setTimeout(() => void load(), POLL_MS)
        } else if (review.status === 'done') {
          // a submit from this page already shows its own result
          setPhase((current) => (current.kind === 'done' ? current : { kind: 'done', synced: 0, failed: 0, alreadyDone: true }))
        } else {
          setPhase({ kind: 'ready', review, submitting: false, error: null })
        }
      } catch (error) {
        if (live) setPhase({ kind: 'error', message: describeBackendError(error) })
      }
    }

    nudgeSync()
    void load()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [settings, attempt])

  async function submit(decisions: ReviewDecision[]) {
    if (!settings || phase.kind !== 'ready') return
    const ready = phase
    setPhase({ ...ready, submitting: true, error: null })
    try {
      const result = await new BackendClient(settings).submitReview({ decisions })
      setPhase({ kind: 'done', synced: result.linked, failed: result.failed, alreadyDone: false })
      // fetch the linked threads and write their notes now, and clear the side panel's prompt
      nudgeSync()
      void refreshMe()
    } catch (error) {
      if (error instanceof BackendError && error.status === 409) {
        // the backend is still collecting after all; go back to waiting
        setPhase({ kind: 'loading' })
        setAttempt((n) => n + 1)
        return
      }
      setPhase({ ...ready, submitting: false, error: describeBackendError(error) })
    }
  }

  let state: ReviewViewState
  if (settings === undefined) {
    state = { kind: 'loading' }
  } else if (settings === null) {
    state = {
      kind: 'signedOut',
      signingIn,
      error: signInError,
      onSignIn: async () => {
        setSigningIn(true)
        setSignInError(null)
        try {
          await signIn()
        } catch (error) {
          setSignInError((error as Error).message)
        } finally {
          setSigningIn(false)
        }
      },
    }
  } else if (phase.kind === 'error') {
    state = {
      kind: 'error',
      message: phase.message,
      onRetry: () => {
        setPhase({ kind: 'loading' })
        setAttempt((n) => n + 1)
      },
    }
  } else {
    state = phase
  }

  return (
    <ReviewView
      state={state}
      onSearch={(query) => (settings ? new BackendClient(settings).searchPeople(query) : Promise.resolve([]))}
      onSubmit={(decisions) => void submit(decisions)}
      onOpenLinkedIn={() => void browser.tabs.create({ url: 'https://www.linkedin.com/messaging/' })}
      onClose={() =>
        void browser.tabs.getCurrent().then((tab) => (tab?.id !== undefined ? browser.tabs.remove(tab.id) : window.close()))
      }
    />
  )
}

createRoot(document.getElementById('root')!).render(<Review />)
