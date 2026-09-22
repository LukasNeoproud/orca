import type { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type { PortableConversationSource } from '../../shared/portable-conversation-source'
import type { PortableConversationBranchRecord } from '../../shared/portable-conversation-branch'
import { isPortableConversationBranchRecord } from './portable-conversation-branch-service'

export async function attachExistingPortableConversationBranch(
  store: AgentSessionBranchStore,
  branchId: string,
  target: PortableConversationSource
): Promise<PortableConversationBranchRecord> {
  return store.runExclusive(`attach:${branchId}`, async () => {
    const branch = store.get(branchId)
    if (!branch || !isPortableConversationBranchRecord(branch)) {
      throw new Error('portable_conversation_branch_missing')
    }
    if (branch.state === 'started' && branch.target.terminal.existingSource) {
      if (JSON.stringify(branch.target.terminal.existingSource) !== JSON.stringify(target)) {
        throw new Error('portable_conversation_branch_operation_conflict')
      }
      return branch
    }
    if (branch.target.terminal.launch) {
      throw new Error('portable_conversation_branch_operation_conflict')
    }
    const next: PortableConversationBranchRecord = {
      ...branch,
      state: 'started',
      target: {
        ...branch.target,
        terminal: { ...branch.target.terminal, existingSource: target }
      },
      updatedAt: Date.now()
    }
    return store.put(next) as Promise<PortableConversationBranchRecord>
  })
}
