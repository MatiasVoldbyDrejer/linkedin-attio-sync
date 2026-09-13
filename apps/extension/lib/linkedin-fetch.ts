import { browser } from 'wxt/browser'
import type { FetchResult, RequestSpec } from '@linkedin-sync/core'
// zod-free entry: the parsers stay out of the service worker bundle
import { buildRequest, type LinkedInRequestConfig } from '@linkedin-sync/core/requests'
import { getLocal, setLocal, type FetchStrategy } from './storage'

const LINKEDIN_ORIGIN = 'https://www.linkedin.com'

interface RawResponse {
  status: number
  body: unknown
  /** True when the response says our session context was unusable, not LinkedIn's verdict */
  contextFailed: boolean
}

function isContextFailure(status: number, contentType: string, text: string): boolean {
  if (status === 0) return true // opaque redirect or network error
  if (status === 403 && /csrf/i.test(text)) return true
  // a login or checkpoint page instead of JSON
  return status === 200 && !contentType.includes('json')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function fetchFromWorker(url: string, headers: Record<string, string>): Promise<RawResponse> {
  const cookie = await browser.cookies.get({ url: LINKEDIN_ORIGIN, name: 'JSESSIONID' })
  if (!cookie) return { status: 0, body: null, contextFailed: true }
  try {
    const res = await fetch(url, {
      headers: { ...headers, 'csrf-token': cookie.value.replace(/"/g, '') },
      credentials: 'include',
      redirect: 'manual',
    })
    const text = await res.text()
    const contentType = res.headers.get('content-type') ?? ''
    return { status: res.status, body: parseJson(text), contextFailed: isContextFailure(res.status, contentType, text) }
  } catch {
    return { status: 0, body: null, contextFailed: true }
  }
}

/** Runs inside a linkedin.com tab, so it must not reference anything outside itself. */
async function pageFetch(url: string, headers: Record<string, string>) {
  const csrf = document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1]
  if (!csrf) return { status: 0, contentType: '', text: '' }
  try {
    const res = await fetch(url, { headers: { ...headers, 'csrf-token': csrf }, credentials: 'include', redirect: 'manual' })
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', text: await res.text() }
  } catch {
    return { status: 0, contentType: '', text: '' }
  }
}

async function fetchFromTab(url: string, headers: Record<string, string>): Promise<RawResponse | null> {
  const tabs = await browser.tabs.query({ url: `${LINKEDIN_ORIGIN}/*` })
  const tab = tabs.find((t) => t.status === 'complete' && !t.discarded) ?? tabs[0]
  if (tab?.id === undefined) return null
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: pageFetch,
      args: [url, headers],
    })
    const result = injection?.result as Awaited<ReturnType<typeof pageFetch>> | undefined
    if (!result) return null
    return {
      status: result.status,
      body: parseJson(result.text),
      contextFailed: isContextFailure(result.status, result.contentType, result.text),
    }
  } catch {
    return null
  }
}

async function fetchWith(strategy: FetchStrategy, url: string, headers: Record<string, string>) {
  return strategy === 'worker' ? fetchFromWorker(url, headers) : fetchFromTab(url, headers)
}

/**
 * Executes one backend-requested LinkedIn call with the user's session. Tries the
 * strategy that last worked first, then the other; the backend sees LinkedIn's
 * real answer or a `no_session_context` marker.
 */
export async function executeLinkedInRequest(config: LinkedInRequestConfig, spec: RequestSpec): Promise<FetchResult> {
  const base = { ...spec, configVersion: config.version }
  const fail = (error: string): FetchResult => ({ ...base, status: 0, body: { error }, fetchedAt: Date.now() })

  let built
  try {
    built = buildRequest(config, spec.request, spec.params)
  } catch (error) {
    return fail(`build_failed: ${(error as Error).message}`)
  }
  // The config comes from the backend; never let it point the user's session elsewhere.
  if (new URL(built.url).origin !== LINKEDIN_ORIGIN) return fail('blocked_origin')

  const preferred = (await getLocal('fetchStrategy')) ?? 'worker'
  const order: FetchStrategy[] = preferred === 'worker' ? ['worker', 'tab'] : ['tab', 'worker']

  let fromTab: RawResponse | null = null
  for (const strategy of order) {
    const response = await fetchWith(strategy, built.url, built.headers)
    if (!response) continue
    if (!response.contextFailed) {
      if (strategy !== preferred) await setLocal('fetchStrategy', strategy)
      return { ...base, status: response.status, body: response.body, fetchedAt: Date.now() }
    }
    if (strategy === 'tab') fromTab = response
  }
  // A failure inside a real LinkedIn tab reflects the session itself (e.g. a login page),
  // so pass it on for auth detection. A worker-only failure just means no usable context.
  return fromTab && fromTab.status !== 0
    ? { ...base, status: fromTab.status, body: fromTab.body, fetchedAt: Date.now() }
    : fail('no_session_context')
}
