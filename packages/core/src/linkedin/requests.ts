import rawConfig from './request-config.json'

/**
 * Request definitions are data, not code: the extension fetches this config from
 * the backend, so a changed queryId or variable shape ships with a server deploy
 * instead of an extension release.
 */

/**
 * `conversations` is the unfiltered first inbox page the regular poll uses. `inboxPage` and
 * `inboxPageAfter` page back through the primary inbox by cursor (LinkedIn ignores
 * `lastUpdatedBefore`), 25 at a time, for the first-sign-in review.
 */
export type RequestName = 'me' | 'conversations' | 'inboxPage' | 'inboxPageAfter' | 'conversationById' | 'messages'

export interface RequestTemplate {
  /** Path relative to baseUrl; `{param}` placeholders are URL-encoded on build */
  path: string
  accept: string
}

export interface LinkedInRequestConfig {
  version: string
  baseUrl: string
  headers: Record<string, string>
  requests: Record<RequestName, RequestTemplate>
}

export interface BuiltRequest {
  name: RequestName
  url: string
  headers: Record<string, string>
}

export const defaultRequestConfig: LinkedInRequestConfig = rawConfig

/** Rest.li variables need parens encoded too, which encodeURIComponent leaves alone. */
export function encodeVariable(value: string | number): string {
  return encodeURIComponent(String(value)).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

export function buildRequest(
  config: LinkedInRequestConfig,
  name: RequestName,
  params: Record<string, string | number> = {},
): BuiltRequest {
  const template = config.requests[name]
  const path = template.path.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    if (value === undefined) throw new Error(`Missing param "${key}" for LinkedIn request "${name}"`)
    return encodeVariable(value)
  })
  return {
    name,
    url: config.baseUrl + path,
    headers: { ...config.headers, accept: template.accept },
  }
}
