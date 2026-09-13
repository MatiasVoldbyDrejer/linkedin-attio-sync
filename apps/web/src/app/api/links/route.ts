import { AttioError } from '@linkedin-sync/core'
import { authenticate, unauthorized } from '@/lib/auth'
import { linkConversation, NotFoundError } from '@/lib/linking'
import { linkRequestSchema, parseJson } from '@/lib/validation'

export async function POST(request: Request) {
  const user = await authenticate(request)
  if (!user) return unauthorized()
  const body = await parseJson(request, linkRequestSchema)
  if (body instanceof Response) return body

  try {
    return Response.json(await linkConversation(body, user))
  } catch (error) {
    if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 })
    if (error instanceof AttioError && error.status === 404) {
      return Response.json({ error: 'That Attio person no longer exists' }, { status: 422 })
    }
    throw error
  }
}
