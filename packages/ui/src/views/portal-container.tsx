'use client'

import { createContext, useContext } from 'react'

/**
 * Where views portal their popups. Base UI portals into document.body by default,
 * which on linkedin.com is outside the extension's shadow root and so unstyled; the
 * content script provides its shadow-root container here.
 */
const PortalContainerContext = createContext<HTMLElement | ShadowRoot | undefined>(undefined)

export const PortalContainerProvider = PortalContainerContext.Provider

export function usePortalContainer(): HTMLElement | ShadowRoot | undefined {
  return useContext(PortalContainerContext)
}
