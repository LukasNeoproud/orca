import { createContext } from 'react'

export type NativeChatBranchRow = { messageId: string; markdown: string }

/** What a completed reply's controls offer; absent where the chat cannot branch. */
export type NativeChatBranchSurface = {
  branchFrom: (row: NativeChatBranchRow) => void
}

export const NativeChatBranchContext = createContext<NativeChatBranchSurface | undefined>(undefined)
