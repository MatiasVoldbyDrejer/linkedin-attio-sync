import { authenticate, unauthorized } from '@/lib/auth'
import { attio } from '@/lib/linking'

export async function GET(request: Request) {
  if (!(await authenticate(request))) return unauthorized()
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!query) return Response.json({ people: [] })
  return Response.json({ people: await attio().searchPeople(query.slice(0, 256), 10) })
}
