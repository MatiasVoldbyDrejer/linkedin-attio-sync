import { z } from 'zod'
import type { LinkRequest, ManualSyncRequest, ReviewSubmitRequest, SyncRequest } from '@linkedin-sync/core'

const requestName = z.enum(['me', 'conversations', 'inboxPage', 'inboxPageAfter', 'conversationById', 'messages'])
const conversationUrn = z.string().startsWith('urn:li:msg_conversation:')
const params = z.record(z.string(), z.union([z.string(), z.number()]))

const fetchResult = z.object({
  request: requestName,
  params,
  configVersion: z.string().max(40),
  status: z.number().int(),
  body: z.unknown(),
  fetchedAt: z.number(),
})

export const syncRequestSchema = z.object({
  extensionVersion: z.string().max(40),
  timeZone: z.string().max(80),
  results: z.array(fetchResult).max(50),
  observedRequests: z.array(z.string().max(2000)).max(50).default([]),
}) satisfies z.ZodType<SyncRequest, unknown>

export const linkRequestSchema = z.object({
  conversationUrn: z.string().startsWith('urn:li:msg_conversation:'),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('link'), recordId: z.uuid() }),
    z.object({ type: z.literal('create') }),
    z.object({ type: z.literal('ignore') }),
  ]),
}) satisfies z.ZodType<LinkRequest, unknown>

export const manualSyncRequestSchema = z.object({
  threadId: z.string().regex(/^2-[A-Za-z0-9+/=_-]{8,200}$/, 'expected a LinkedIn thread id (2-…)'),
  results: z.array(fetchResult).max(5).optional(),
}) satisfies z.ZodType<ManualSyncRequest, unknown>

export const reviewSubmitSchema = z.object({
  decisions: z
    .array(
      z.object({
        conversationUrn,
        action: z.discriminatedUnion('type', [
          z.object({ type: z.literal('link'), recordId: z.uuid() }),
          z.object({ type: z.literal('create') }),
          z.object({ type: z.literal('skip') }),
        ]),
      }),
    )
    .max(200),
}) satisfies z.ZodType<ReviewSubmitRequest, unknown>

export async function parseJson<T>(request: Request, schema: z.ZodType<T, unknown>): Promise<T | Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  return parsed.data
}
