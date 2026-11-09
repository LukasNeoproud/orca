import { createContext, useContext } from 'react'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'

export type MobileConversationBranching = {
  /** Branches the conversation after the turn `message` ends. */
  branchFrom: (message: NativeChatMessage) => void
  /** Only in a chat that is itself a branch: hands `message` back to where it branched from. */
  returnFrom?: (message: NativeChatMessage) => void
  /** Only when this chat has a branch or is one. */
  openFamily?: () => void
}

// Why a context: the message actions sheet reads it, so the chat view and its controller, both at
// their line caps, carry no branching plumbing.
export const MobileConversationBranchContext = createContext<MobileConversationBranching | null>(
  null
)

export function useMobileConversationBranching(): MobileConversationBranching | null {
  return useContext(MobileConversationBranchContext)
}
