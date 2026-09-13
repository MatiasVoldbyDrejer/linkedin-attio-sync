const THREAD_PATH = /^\/messaging\/thread\/([^/]+)/

/** `2-…` thread id from a linkedin.com/messaging/thread/<threadId>/ path, else null. */
export function threadIdFromPath(pathname: string): string | null {
  const segment = pathname.match(THREAD_PATH)?.[1]
  if (!segment) return null
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/** Conversation URNs look like urn:li:msg_conversation:(urn:li:fsd_profile:<mailbox>,<threadId>) */
export function isThreadConversation(conversationUrn: string, threadId: string): boolean {
  return conversationUrn.endsWith(`,${threadId})`)
}
