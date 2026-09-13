import { authenticate, unauthorized } from '@/lib/auth'
import { handleManualSync } from '@/lib/manual-sync'
import { manualSyncRequestSchema, parseJson } from '@/lib/validation'

export async function POST(request: Request) {
  const user = await authenticate(request)
  if (!user) return unauthorized()
  const body = await parseJson(request, manualSyncRequestSchema)
  if (body instanceof Response) return body
  return Response.json(await handleManualSync(body, user))
}
