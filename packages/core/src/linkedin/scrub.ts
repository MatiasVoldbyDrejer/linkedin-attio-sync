/**
 * Deterministically strips personal data from a Voyager payload while keeping its
 * structure, so it can be handed to the self-heal agent or committed as a fixture.
 * The same input always maps to the same placeholder, which keeps cross-references
 * (a sender URN matching a participant URN) intact.
 */

const STRUCTURAL_KEYS = new Set([
  '$type',
  '_type',
  '_recipeType',
  '$recipeTypes',
  'recipeType',
  'category',
  'categories',
  'state',
  'notificationStatus',
  'participantType',
  'memberBadgeType',
  'disabledFeature',
  'attributeKind',
  'type',
  'distance',
  'emoji',
])

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function scrubString(value: string, key: string): string {
  if (STRUCTURAL_KEYS.has(key)) return value
  if (/^[A-Z0-9_]+$/.test(value)) return value // enums
  if (value.startsWith('com.linkedin.')) return value // type names
  if (value.startsWith('urn:li:')) {
    return value.replace(/(ACoA[A-Za-z0-9_-]+|2-[A-Za-z0-9=+/_-]+|\d{6,})/g, (id) => {
      const prefix = id.startsWith('ACoA') ? 'ACoAFAKE' : id.startsWith('2-') ? '2-FAKE' : '9'
      return prefix + fnv1a(id)
    })
  }
  if (/^https?:\/\//.test(value)) {
    try {
      const url = new URL(value)
      const firstSegment = url.pathname.split('/').filter(Boolean)[0] ?? 'x'
      return `${url.origin}/${firstSegment}/scrubbed-${fnv1a(value)}${url.pathname.endsWith('/') ? '/' : ''}`
    } catch {
      return `https://example.com/${fnv1a(value)}`
    }
  }
  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return `id_${fnv1a(value)}`
  return `«${key}:${fnv1a(value)}:${value.length}»`
}

export function scrubPayload(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    // image renditions are noise for parsing; one is enough to keep the shape
    const items = key === 'artifacts' ? value.slice(0, 1) : value
    return items.map((item) => scrubPayload(item, key))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubPayload(v, k)]))
  }
  if (typeof value === 'string') return scrubString(value, key)
  return value
}
