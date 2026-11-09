import { expect, it } from 'vitest'
import { branchRecord } from './conversation-branch.test-fixture'
import type { AgentSessionStatusSummary } from './agent-session-wire'

import { workingConversationBranchRelatives } from './conversation-branch-relatives'

function names(...args: Parameters<typeof workingConversationBranchRelatives>): (string | null)[] {
  return workingConversationBranchRelatives(...args).map((relative) => relative.name)
}

function chat(
  sessionId: string,
  providerSessionId: string,
  status: 'working' | 'idle',
  workspaceId = 'wt-1'
): [string, AgentSessionStatusSummary] {
  const summary: AgentSessionStatusSummary = {
    sessionId,
    workspaceId,
    agent: 'claude',
    status,
    latestPrompt: '',
    updatedAt: 1,
    providerSession: { key: 'session_id', id: providerSessionId }
  }
  return [sessionId, summary]
}

const branches = [
  branchRecord({
    branchId: 'a',
    label: 'Fix parser',
    child: { providerSessionId: 'c1', surface: 'chat' }
  }),
  branchRecord({
    branchId: 'b',
    label: 'Fix cache',
    child: { providerSessionId: 'c2', surface: 'chat' }
  })
]

it('names relatives working in the same workspace, never the chat itself', () => {
  const snapshot = new Map([
    chat('s-parent', 'parent', 'working'),
    chat('s-1', 'c1', 'working'),
    chat('s-2', 'c2', 'idle')
  ])
  expect(names(snapshot, branches, 'c2', 'wt-1')).toEqual([null, 'Fix parser'])
  expect(names(snapshot, branches, 'c1', 'wt-1')).toEqual([null])
})

it('ignores another workspace and a conversation with no branches', () => {
  const snapshot = new Map([chat('s-1', 'c1', 'working', 'wt-2')])
  expect(names(snapshot, branches, 'c2', 'wt-1')).toEqual([])
  expect(names(snapshot, [], 'c2', 'wt-1')).toEqual([])
})
