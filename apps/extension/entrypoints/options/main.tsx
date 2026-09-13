import '../../assets/tailwind.css'
import { type WelcomeAccount, WelcomeView, type WelcomeViewProps } from '@linkedin-sync/ui/views/welcome-view'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { useLocal, useSettings } from '../../hooks/use-local'
import { refreshMe, signIn, signOut } from '../../lib/auth'
import { backendUrl, DEFAULT_BACKEND_URL } from '../../lib/config'
import { sendToBackground } from '../../lib/messages'
import { openReview } from '../../lib/review'
import { availableUpdate } from '../../lib/ui'

/** Only https backends, or http on localhost for development. */
function originPattern(url: URL): string {
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('Use an https:// URL (http:// is only allowed for localhost).')
  }
  // Chrome match patterns ignore ports, so this covers localhost:3000 too
  return `${url.protocol}//${url.hostname}/*`
}

function Welcome() {
  const settings = useSettings()
  const me = useLocal('me')
  const notice = useLocal('authNotice')
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<WelcomeViewProps['backend']['result']>(null)

  useEffect(() => {
    void backendUrl().then(setUrl)
    void refreshMe()
  }, [])

  const show = (text: string, tone: 'muted' | 'error') => setResult({ text, tone })

  async function submit() {
    try {
      const parsed = new URL(url.trim())
      const chosen = parsed.href.replace(/\/+$/, '')
      if (chosen === DEFAULT_BACKEND_URL) {
        await sendToBackground({ type: 'setBackendOverride', backendUrl: null })
        return show('Using the built-in backend. Sign in again.', 'muted')
      }
      // must be the first await: permission prompts need the click's user gesture
      const granted = await browser.permissions.request({ origins: [originPattern(parsed)] })
      if (!granted) return show('Permission to reach that backend was denied.', 'error')
      await sendToBackground({ type: 'setBackendOverride', backendUrl: chosen })
      show(`Now using ${chosen}. Sign in again.`, 'muted')
    } catch (error) {
      show((error as Error).message, 'error')
    }
  }

  let account: WelcomeAccount | undefined
  if (settings === null && notice.loaded) {
    account = {
      signedIn: false,
      notice: notice.value,
      signingIn,
      signInError,
      onSignIn: async () => {
        setSigningIn(true)
        setSignInError(null)
        try {
          // a tab stays open while the Attio window has focus, so this can run right here
          await signIn()
        } catch (error) {
          setSignInError((error as Error).message)
        } finally {
          setSigningIn(false)
        }
      },
    }
  } else if (settings && me.loaded) {
    account = {
      signedIn: true,
      me: me.value,
      update: availableUpdate(me.value),
      onSignOut: () => void signOut(),
      onOpenReview: () => void openReview(),
    }
  }

  return (
    <WelcomeView
      account={account}
      onOpenLinkedIn={() => void browser.tabs.create({ url: 'https://www.linkedin.com/messaging/' })}
      backend={{
        url,
        onUrlChange: setUrl,
        onSubmit: () => void submit(),
        onReset: async () => {
          await sendToBackground({ type: 'setBackendOverride', backendUrl: null })
          setUrl(DEFAULT_BACKEND_URL)
          show('Using the built-in backend. Sign in again.', 'muted')
        },
        result,
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(<Welcome />)
