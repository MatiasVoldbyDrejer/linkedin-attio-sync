import { authenticate, unauthorized } from '@/lib/auth'
import { NotFoundError } from '@/lib/linking'
import { getReview, ReviewNotReadyError, submitReview } from '@/lib/review'
import { parseJson, reviewSubmitSchema } from '@/lib/validation'

export async function GET(request: Request) {
  const user = await authenticate(request)
  if (!user) return unauthorized()
  return Response.json(await getReview(user))
}

export async function POST(request: Request) {
  const user = await authenticate(request)
  if (!user) return unauthorized()
  const body = await parseJson(request, reviewSubmitSchema)
  if (body instanceof Response) return body

  try {
    return Response.json(await submitReview(user, body.decisions))
  } catch (error) {
    if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 })
    if (error instanceof ReviewNotReadyError) return Response.json({ error: error.message }, { status: 409 })
    throw error
  }
}
