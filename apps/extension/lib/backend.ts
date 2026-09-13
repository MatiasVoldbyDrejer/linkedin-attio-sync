import type {
  AttioPersonSummary,
  LinkedInRequestConfig,
  LinkRequest,
  LinkResponse,
  ManualSyncRequest,
  ManualSyncResponse,
  MeResponse,
  ReviewResponse,
  ReviewSubmitRequest,
  ReviewSubmitResponse,
  SyncRequest,
  SyncResponse,
} from '@linkedin-sync/core'
import type { Settings } from './storage'

export const SIGN_IN_MESSAGE = 'Sign in to the LinkedIn → Attio extension'

export class BackendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The session token is missing, revoked or expired. */
export const isUnauthorized = (error: unknown): boolean => error instanceof BackendError && error.status === 401

export class BackendClient {
  private readonly baseUrl: string

  constructor(private readonly settings: Settings) {
    this.baseUrl = settings.backendUrl.replace(/\/+$/, '')
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        authorization: `Bearer ${this.settings.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new BackendError(res.status, `Backend ${res.status} on ${path}${text ? `: ${text.slice(0, 200)}` : ''}`)
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  }

  sync(request: SyncRequest): Promise<SyncResponse> {
    return this.request('POST', '/api/sync', request)
  }

  config(): Promise<LinkedInRequestConfig> {
    return this.request('GET', '/api/linkedin/config')
  }

  me(): Promise<MeResponse> {
    return this.request('GET', '/api/me')
  }

  signOut(): Promise<void> {
    return this.request('POST', '/api/auth/signout')
  }

  async searchPeople(query: string): Promise<AttioPersonSummary[]> {
    const { people } = await this.request<{ people: AttioPersonSummary[] }>(
      'GET',
      `/api/attio/people?q=${encodeURIComponent(query)}`,
    )
    return people
  }

  link(request: LinkRequest): Promise<LinkResponse> {
    return this.request('POST', '/api/links', request)
  }

  manualSync(request: ManualSyncRequest): Promise<ManualSyncResponse> {
    return this.request('POST', '/api/conversations/sync', request)
  }

  review(): Promise<ReviewResponse> {
    return this.request('GET', '/api/review')
  }

  submitReview(request: ReviewSubmitRequest): Promise<ReviewSubmitResponse> {
    return this.request('POST', '/api/review', request)
  }
}

/** Short, actionable text for inline UI that can't show a raw backend error. */
export function describeBackendError(error: unknown): string {
  if (isUnauthorized(error)) return SIGN_IN_MESSAGE
  if (error instanceof BackendError) return `Backend error (${error.status})`
  // fetch rejects with a TypeError when the backend can't be reached at all
  if (error instanceof TypeError) return 'Backend unreachable'
  return (error as Error).message
}
