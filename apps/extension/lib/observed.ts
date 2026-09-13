const MESSAGING_GRAPHQL = '/voyager/api/voyagerMessagingGraphQL/graphql'

/**
 * Turns a Voyager messaging URL LinkedIn's own web app requested into a path
 * relative to /voyager/api with profile and thread ids replaced, so it can be
 * reported without leaking who the user talks to.
 */
export function toObservedRequest(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.origin !== 'https://www.linkedin.com' || url.pathname !== MESSAGING_GRAPHQL) return null
  const path = decodeURIComponent(url.pathname.slice('/voyager/api'.length) + url.search)
  return path
    .replace(/ACoA[A-Za-z0-9_-]+/g, '{profileId}')
    .replace(/2-[A-Za-z0-9=+/_-]+/g, '{threadId}')
    .replace(/(syncToken|nextCursor|prevCursor):[^,)]+/g, '$1:{token}')
    .replace(/(lastUpdatedBefore|deliveredAt|createdBefore|anchorTimestamp):\d+/g, '$1:{timestamp}')
}

export function collectObservedRequests(): string[] {
  const paths = performance
    .getEntriesByType('resource')
    .map((entry) => toObservedRequest(entry.name))
    .filter((path) => path !== null)
  return [...new Set(paths)]
}
