import type { ConversationBranchRecord } from './conversation-branch'

export function branchRecord(
  overrides: Partial<ConversationBranchRecord> = {}
): ConversationBranchRecord {
  return {
    schemaVersion: 1,
    branchId: 'branch-1',
    requestId: 'request-1',
    workspaceId: 'wt-1',
    executionHostId: 'local',
    agent: 'claude',
    parent: {
      providerSessionId: 'parent',
      promptUuid: 'p1',
      boundaryUuid: 'a1',
      excerpt: 'Two findings'
    },
    child: { providerSessionId: 'child', surface: 'chat' },
    mode: 'full',
    label: 'Finding 1',
    state: 'prepared',
    returns: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}
