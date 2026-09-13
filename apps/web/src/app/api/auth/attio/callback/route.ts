import { AttioClient, type AuthErrorCode } from '@linkedin-sync/core'
import { exchangeCode, getTeamWorkspace, redirectToExtension, verifyState } from '@/lib/attio-oauth'
import { createSession, upsertUser } from '@/lib/users'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const redirect = verifyState(params.get('state') ?? '')
  if (!redirect) return new Response('This sign-in link expired. Start again from the extension.', { status: 400 })

  const fail = (error: AuthErrorCode, message: string) => redirectToExtension(redirect, { error, message })
  const code = params.get('code')
  if (params.get('error') || !code) return fail('denied', 'Sign-in was cancelled in Attio.')

  try {
    // the member's OAuth token is only used to learn who they are, then dropped
    const client = new AttioClient(await exchangeCode(code))
    const [self, team] = await Promise.all([client.self(), getTeamWorkspace()])
    if (!self.active || !self.memberId || self.workspaceId !== team.id) {
      return fail('wrong_workspace', `Sign in to the ${team.name} workspace in Attio.`)
    }
    const member = await client.getWorkspaceMember(self.memberId)
    const user = await upsertUser({ attioWorkspaceMemberId: self.memberId, name: member.name, email: member.email })
    return redirectToExtension(redirect, { token: await createSession(user.id) })
  } catch (error) {
    console.error('[auth] Attio sign-in failed', error)
    return fail('server_error', 'Sign-in failed. Try again.')
  }
}
