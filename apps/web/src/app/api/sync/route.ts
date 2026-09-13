import { authenticate, unauthorized } from '@/lib/auth'
import { handleSync } from '@/lib/sync'
import { parseJson, syncRequestSchema } from '@/lib/validation'

export async function POST(request: Request) {
  const user = await authenticate(request)
  if (!user) return unauthorized()
  const body = await parseJson(request, syncRequestSchema)
  if (body instanceof Response) return body
  return Response.json(await handleSync(body, user))
}
