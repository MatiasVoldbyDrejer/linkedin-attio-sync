import type { RequestName } from './linkedin/requests'

/**
 * What the backend sends to the self-heal routine as `text` on /fire. Every
 * payload value is scrubbed before it leaves the backend.
 */

export type IncidentKind =
  /** LinkedIn answered 200 but the body no longer matches our schema */
  | 'parse_error'
  /** LinkedIn rejected the request itself (usually a rotated queryId) */
  | 'fetch_failed'
  /** Parsed fine but the result is implausible, e.g. an empty inbox */
  | 'canary'

export interface IncidentPayload {
  incidentId: string
  kind: IncidentKind
  fingerprint: string
  request: RequestName
  configVersion: string
  /** Deploy SHA that produced the failure */
  build: string
  summary: string
  /** Zod issue paths/messages or the HTTP status + body excerpt */
  details: unknown
  /** Scrubbed failing response body, ready to commit as a fixture */
  sample: unknown
  /** Scrubbed voyagerMessagingGraphQL paths LinkedIn's web app used recently */
  observedRequests: string[]
}

/** Paths replace array indexes with `*` so one schema change maps to one incident. */
export function incidentFingerprint(kind: IncidentKind, request: RequestName, paths: string[]): string {
  const normalized = [...new Set(paths.map((p) => p.replace(/\.\d+(?=\.|$)/g, '.*')))].sort()
  return `${kind}:${request}:${normalized.join('|')}`
}
