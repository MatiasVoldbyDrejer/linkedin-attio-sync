import {
  incidentFingerprint,
  scrubPayload,
  type IncidentKind,
  type IncidentPayload,
  type RequestName,
} from '@linkedin-sync/core'
import { db, DbError, unwrap } from './supabase'
import { BUILD } from './rows'

const MAX_DISPATCHES_PER_DAY = 3
const MAX_SAMPLE_ELEMENTS = 3
const ROUTINE_BETA = 'experimental-cc-routine-2026-04-01'

export interface IncidentInput {
  kind: IncidentKind
  request: RequestName
  /** What distinguishes this failure: schema paths, status code, canary code */
  paths: string[]
  summary: string
  /** Sent as-is, so callers scrub anything taken from LinkedIn data; schema paths and messages need no scrubbing */
  details: unknown
  /** Scrubbed here before it leaves the backend */
  body: unknown
  configVersion: string
  observedRequests: string[]
}

interface IncidentRow {
  id: string
  status: 'open' | 'dispatched' | 'resolved'
  summary: string
  occurrences: number
  payload: IncidentPayload
}

/** A few elements per collection show a schema change as well as twenty do. */
function trimSample(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, MAX_SAMPLE_ELEMENTS).map(trimSample)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimSample(v)]))
  }
  return value
}

async function liveIncidentByFingerprint(fingerprint: string): Promise<IncidentRow | null> {
  return unwrap(
    db().from('incidents').select('id, status, summary, occurrences, payload').eq('fingerprint', fingerprint).neq('status', 'resolved').maybeSingle(),
  )
}

/** Records (or bumps) the incident and dispatches the self-heal routine for new ones. */
export async function recordIncident(input: IncidentInput): Promise<string> {
  const fingerprint = incidentFingerprint(input.kind, input.request, input.paths)
  const existing = await liveIncidentByFingerprint(fingerprint)
  if (existing) {
    await unwrap(
      db()
        .from('incidents')
        .update({ occurrences: existing.occurrences + 1, last_seen_at: new Date().toISOString() })
        .eq('id', existing.id),
    )
    // an earlier dispatch may have been skipped by the rate limit
    if (existing.status === 'open') await dispatch(existing.payload)
    return existing.id
  }

  const id = crypto.randomUUID()
  const payload: IncidentPayload = {
    incidentId: id,
    kind: input.kind,
    fingerprint,
    request: input.request,
    configVersion: input.configVersion,
    build: BUILD,
    summary: input.summary,
    details: input.details,
    sample: trimSample(scrubPayload(input.body)),
    observedRequests: input.observedRequests,
  }
  try {
    await unwrap(db().from('incidents').insert({ id, fingerprint, kind: input.kind, summary: input.summary, payload }))
  } catch (error) {
    // a concurrent sync opened the same incident first
    if (error instanceof DbError && error.code === '23505') return recordIncident(input)
    throw error
  }
  await dispatch(payload)
  return id
}

async function dispatch(payload: IncidentPayload): Promise<void> {
  const url = process.env.CLAUDE_ROUTINE_FIRE_URL
  const token = process.env.CLAUDE_ROUTINE_TOKEN
  if (!url || !token) {
    console.warn(`[self-heal] routine not configured; incident ${payload.incidentId} stays open`)
    return
  }

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count, error } = await db().from('incidents').select('id', { count: 'exact', head: true }).gte('dispatched_at', since)
  if (error) throw new DbError(error.message, error.code)
  if ((count ?? 0) >= MAX_DISPATCHES_PER_DAY) {
    console.warn(`[self-heal] dispatch limit reached; incident ${payload.incidentId} waits`)
    return
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'anthropic-beta': ROUTINE_BETA,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: JSON.stringify(payload, null, 2) }),
  })
  if (!res.ok) {
    console.error(`[self-heal] routine fire failed ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return
  }
  const fired = (await res.json()) as { claude_code_session_url?: string }
  await unwrap(
    db()
      .from('incidents')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString(), agent_session_url: fired.claude_code_session_url ?? null })
      .eq('id', payload.incidentId),
  )
}

export async function resolveIncident(id: string): Promise<void> {
  await unwrap(
    db()
      .from('incidents')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by_build: BUILD })
      .eq('id', id)
      .neq('status', 'resolved'),
  )
}

/** Fetch failures and canaries have no stored body to replay; a healthy response resolves them. */
export async function resolveIncidentsFor(kind: IncidentKind, request: RequestName): Promise<void> {
  await unwrap(
    db()
      .from('incidents')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by_build: BUILD })
      .like('fingerprint', `${kind}:${request}:%`)
      .neq('status', 'resolved'),
  )
}

export async function oldestLiveIncident(): Promise<Pick<IncidentRow, 'id' | 'status' | 'summary'> | null> {
  return unwrap(
    db().from('incidents').select('id, status, summary').neq('status', 'resolved').order('first_seen_at').limit(1).maybeSingle(),
  )
}
