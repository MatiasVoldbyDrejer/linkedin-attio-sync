import { LATEST_EXTENSION_VERSION, type MeResponse } from '@linkedin-sync/core'
import { getTeamWorkspace, publicBaseUrl } from '@/lib/attio-oauth'
import { authenticate, unauthorized } from '@/lib/auth'
import { getAccountForUser } from '@/lib/store'

export async function GET(request: Request) {
  const user = await authenticate(request)
  if (!user) return unauthorized()

  const [account, team] = await Promise.all([getAccountForUser(user.id), getTeamWorkspace()])
  const self = account?.self_participant
  const body: MeResponse = {
    user: { name: user.name, email: user.email },
    workspaceName: team.name,
    linkedIn: self ? { name: `${self.firstName} ${self.lastName}`.trim(), profileUrl: self.profileUrl } : null,
    // no account yet means the extension hasn't reported LinkedIn, so the review is still ahead
    reviewStatus: account?.review_status ?? 'collecting',
    extension: {
      latestVersion: LATEST_EXTENSION_VERSION,
      downloadUrl: `${publicBaseUrl()}/extension/linkedin-attio-sync.zip`,
    },
  }
  return Response.json(body)
}
