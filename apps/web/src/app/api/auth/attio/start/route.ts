import { authorizeUrl, isExtensionRedirect, signState } from '@/lib/attio-oauth'

export async function GET(request: Request) {
  const redirect = new URL(request.url).searchParams.get('redirect') ?? ''
  if (!isExtensionRedirect(redirect)) return new Response('Start sign-in from the LinkedIn → Attio extension.', { status: 400 })
  return new Response(null, { status: 302, headers: { location: authorizeUrl(signState(redirect)) } })
}
