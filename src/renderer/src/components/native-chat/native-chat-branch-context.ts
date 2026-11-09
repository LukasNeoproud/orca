import { createContext } from 'react'
import type { ConversationBranchRecord } from '../../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { ConversationBranchFinding } from '../../../../shared/conversation-branch-findings'

export type NativeChatBranchRow = { messageId: string; markdown: string }

/** What a Claude chat offers about branches; absent where the chat cannot branch. */
export type NativeChatBranchSurface = {
  branchFrom: (row: NativeChatBranchRow) => void
  /** One branch per finding `findings` lists; offered only for two or more. */
  branchFindings: (row: NativeChatBranchRow, findings: ConversationBranchFinding[]) => void
  /** Present in a branch: hands a reply back to the conversation it came from. */
  returnFrom?: (row: NativeChatBranchRow) => void
  /** The branches made from this reply, oldest first. */
  branchesAt: (messageId: string) => ConversationBranchRecord[]
  family: {
    branches: readonly ConversationBranchRecord[]
    providerSessionId: string | null
    target: RuntimeClientTarget
    worktreeId: string
  }
  /** Sends, or holds the send while a relative still works in the same workspace. */
  guardSend: (text: string, send: () => boolean | 'queued') => boolean | 'queued'
}

export const NativeChatBranchContext = createContext<NativeChatBranchSurface | undefined>(undefined)
