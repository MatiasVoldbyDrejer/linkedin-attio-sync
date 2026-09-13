import { createHash, randomBytes } from 'node:crypto'
import type { UserRow } from './rows'
import { db, unwrap } from './supabase'

const USER_COLUMNS = 'id, attio_workspace_member_id, name, email'

// only hashes are stored, so a database leak doesn't hand out working tokens
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function upsertUser(input: { attioWorkspaceMemberId: string; name: string; email: string | null }): Promise<UserRow> {
  return unwrap(
    db()
      .from('users')
      .upsert(
        { attio_workspace_member_id: input.attioWorkspaceMemberId, name: input.name, email: input.email },
        { onConflict: 'attio_workspace_member_id' },
      )
      .select(USER_COLUMNS)
      .single(),
  )
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await unwrap(db().from('sessions').insert({ token_hash: hashToken(token), user_id: userId }))
  return token
}

export async function userForToken(token: string): Promise<UserRow | null> {
  const tokenHash = hashToken(token)
  const session = await unwrap<{ users: UserRow } | null>(
    db().from('sessions').select(`users(${USER_COLUMNS})`).eq('token_hash', tokenHash).is('revoked_at', null).maybeSingle(),
  )
  if (!session) return null
  await unwrap(db().from('sessions').update({ last_used_at: new Date().toISOString() }).eq('token_hash', tokenHash))
  return session.users
}

export async function revokeSession(token: string): Promise<void> {
  await unwrap(db().from('sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', hashToken(token)))
}
