import { createContext, useContext } from 'react'

export type MobileNativeChatResponseComments = {
  count: number
  openComments: () => void
  onCommentQuote: (quote: string) => void
}

// Why a context: the transcript rows, the composer chip and the comment drawers all share it,
// so the upstream-owned chat view stays free of response-comment plumbing.
export const MobileNativeChatResponseCommentsContext =
  createContext<MobileNativeChatResponseComments | null>(null)

export function useMobileNativeChatResponseComments(): MobileNativeChatResponseComments | null {
  return useContext(MobileNativeChatResponseCommentsContext)
}
