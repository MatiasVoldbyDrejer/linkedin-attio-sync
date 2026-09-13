import { bearerToken } from '@/lib/auth'
import { revokeSession } from '@/lib/users'

export async function POST(request: Request) {
  const token = bearerToken(request)
  if (token) await revokeSession(token)
  return new Response(null, { status: 204 })
}
