import { defaultRequestConfig } from '@linkedin-sync/core'
import { authenticate, unauthorized } from '@/lib/auth'

export async function GET(request: Request) {
  if (!(await authenticate(request))) return unauthorized()
  return Response.json(defaultRequestConfig, { headers: { 'cache-control': 'no-store' } })
}
