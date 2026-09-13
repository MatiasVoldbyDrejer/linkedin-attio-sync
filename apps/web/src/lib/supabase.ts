import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Service-role client; created lazily so `next build` works without env vars. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    client = createClient(url, key, { auth: { persistSession: false } })
  }
  return client
}

export async function unwrap<T>(
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<T> {
  const { data, error } = await query
  if (error) throw new DbError(error.message, error.code)
  return data as T
}

export class DbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(`Supabase: ${message}`)
  }
}
