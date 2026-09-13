import { getLocal } from './storage'

export const DEFAULT_BACKEND_URL = import.meta.env.WXT_BACKEND_URL

/** The team backend, unless a developer pointed this install elsewhere from the options page. */
export async function backendUrl(): Promise<string> {
  return (await getLocal('backendOverride')) ?? DEFAULT_BACKEND_URL
}
