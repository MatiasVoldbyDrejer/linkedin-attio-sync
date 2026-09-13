/** Long enough to ride out LinkedIn re-rendering the thread header on a thread switch */
const GRACE_MS = 2500

export interface HeaderSlot {
  mounted(): void
  removed(): void
  /** For React's useSyncExternalStore: true while the pill should float instead */
  subscribe(listener: () => void): () => void
  getSnapshot(): boolean
  dispose(): void
}

/**
 * Whether the Sync pill found its place in LinkedIn's thread header. If LinkedIn changes
 * that header and the anchor stops matching, the pill floats bottom-right instead of
 * disappearing.
 */
export function createHeaderSlot(): HeaderSlot {
  let inHeader = false
  let floating = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()

  function set(next: boolean) {
    if (next === floating) return
    floating = next
    for (const listener of listeners) listener()
  }

  function settle() {
    clearTimeout(timer)
    if (inHeader) return set(false)
    timer = setTimeout(() => set(!inHeader), GRACE_MS)
  }

  settle()

  return {
    mounted() {
      inHeader = true
      settle()
    },
    removed() {
      inHeader = false
      settle()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => floating,
    dispose() {
      clearTimeout(timer)
      listeners.clear()
    },
  }
}
