import { beforeEach, expect, it, vi } from 'vitest'
import { branchRecord } from '../../../shared/conversation-branch.test-fixture'
import type { AgentSessionStatusSummary } from '../../../shared/agent-session-wire'

const mocks = vi.hoisted(() => ({
  snapshot: new Map<string, AgentSessionStatusSummary>(),
  appendDraft: vi.fn(),
  openMember: vi.fn(async () => undefined),
  openChat: vi.fn(async () => 'new-chat'),
  recordReturn: vi.fn(async () => ({})),
  warning: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { warning: mocks.warning } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/lib/conversation-branch-launch', () => ({ openBranchChat: mocks.openChat }))
vi.mock('@/lib/conversation-branch-members', () => ({
  openConversationBranchMember: mocks.openMember
}))
vi.mock('@/runtime/conversation-branch-client', () => ({
  recordConversationBranchReturn: mocks.recordReturn
}))
vi.mock('@/runtime/structured-agent-session-status-feed', () => ({
  getStructuredAgentSessionStatusFeed: () => ({ getSnapshot: () => mocks.snapshot })
}))
vi.mock('@/components/conversation-branch/use-conversation-branches', () => ({
  refreshConversationBranches: vi.fn(async () => undefined)
}))
vi.mock('@/components/native-chat/native-chat-draft-cache', () => ({
  appendNativeChatDraftCache: mocks.appendDraft
}))

import { returnConversationBranchResult } from './conversation-branch-return'

const target = { kind: 'local' as const }
const branch = branchRecord()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.snapshot.clear()
})

it('puts the result in the open parent chat as a draft and shows it', async () => {
  mocks.snapshot.set('parent-chat', {
    sessionId: 'parent-chat',
    workspaceId: 'wt-1',
    agent: 'claude',
    status: 'idle',
    latestPrompt: '',
    updatedAt: 1,
    providerSession: { key: 'session_id', id: 'parent' }
  })
  await returnConversationBranchResult({ target, worktreeId: 'wt-1', branch, content: 'Done.' })
  expect(mocks.appendDraft).toHaveBeenCalledWith('agent-session:parent-chat', 'Done.')
  expect(mocks.openMember).toHaveBeenCalledWith(
    expect.objectContaining({ providerSessionId: 'parent' })
  )
  expect(mocks.recordReturn).toHaveBeenCalledWith(
    target,
    expect.objectContaining({ branchId: 'branch-1', content: 'Done.' })
  )
})

it('resumes a parent with no chat holding the result, and keeps it when the host cannot record', async () => {
  mocks.recordReturn.mockRejectedValueOnce(new Error('offline'))
  await returnConversationBranchResult({ target, worktreeId: 'wt-1', branch, content: 'Done.' })
  expect(mocks.openChat).toHaveBeenCalledWith({
    worktreeId: 'wt-1',
    providerSessionId: 'parent',
    prompt: 'Done.'
  })
  expect(mocks.appendDraft).not.toHaveBeenCalled()
  expect(mocks.warning).toHaveBeenCalledOnce()
})
