import { createContext } from 'react'

// Why its own module: screens provide these handlers without loading the markdown renderer.
export type MobileMarkdownLinkTarget =
  | { kind: 'file'; pathText: string }
  | { kind: 'web'; url: string }

export type MobileMarkdownLinkHandlers = {
  /** Routes web links through the owning surface (e.g. the Orca browser) instead of the OS. */
  onOpenUrl?: (url: string) => void
  /** Long press on a link opens its action sheet instead of the row's actions. */
  onShowLinkActions?: (target: MobileMarkdownLinkTarget) => void
}

export const MobileMarkdownLinkContext = createContext<MobileMarkdownLinkHandlers>({})

export const MobileMarkdownLinkHandlerProvider = MobileMarkdownLinkContext.Provider
