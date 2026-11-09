import { beforeEach, expect, it, vi } from 'vitest'
import { branchRecord } from '../../../shared/conversation-branch.test-fixture'

const mocks = vi.hoisted(() => ({
  calls: new Array<string>(),
  adopt: vi.fn((input: Record<string, unknown>) => input),
  begin: vi.fn(),
  prepare: vi.fn(),
  refresh: vi.fn(async () => undefined),
  appendDraft: vi.fn(),
  setTitle: vi.fn()
}))

vi.mock('@/lib/agent-session-launch-plan', () => ({ adoptAgentSessionLaunchVerdict: mocks.adopt }))
vi.mock('@/lib/structured-agent-session-provisional-tab', () => ({
  beginStructuredAgentSessionProvisionalLaunch: mocks.begin
}))
vi.mock('@/runtime/conversation-branch-client', () => ({
  prepareConversationBranch: mocks.prepare
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ setTabCustomTitle: mocks.setTitle }) }
}))
vi.mock('@/components/native-chat/native-chat-draft-cache', () => ({
  appendNativeChatDraftCache: mocks.appendDraft
}))
vi.mock('@/components/conversation-branch/use-conversation-branches', () => ({
  refreshConversationBranches: mocks.refresh
}))

import { startConversationBranchInChat } from './conversation-branch-launch'

const target = { kind: 'local' as const }
const request = {
  requestId: 'request-1',
  worktreeId: 'wt-1',
  source: { kind: 'chat' as const, sessionId: 'chat-parent', itemId: 'item-1' },
  label: 'Fix finding',
  prompt: 'Fix #1'
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  mocks.begin.mockImplementation(() => {
    mocks.calls.push('open')
    return {
      sessionId: 'chat-child',
      settlement: Promise.resolve({ kind: 'structured', sessionId: 'chat-child' })
    }
  })
  mocks.prepare.mockImplementation(async () => {
    mocks.calls.push('prepare')
    return branchRecord({ child: { providerSessionId: 'claude-child', surface: 'chat' } })
  })
})

it('forks first, then opens the fork with the prompt in its saved draft, unsent', async () => {
  await startConversationBranchInChat(target, { ...request, mode: 'full' })
  expect(mocks.calls).toEqual(['prepare', 'open'])
  expect(mocks.prepare.mock.calls[0]?.[1]).toMatchObject({ surface: 'chat', mode: 'full' })
  expect(mocks.prepare.mock.calls[0]?.[1]).not.toHaveProperty('prompt')
  expect(mocks.adopt.mock.calls[0]?.[0]).toMatchObject({
    agent: 'claude',
    resumeFrom: { providerSessionId: 'claude-child' }
  })
  expect(mocks.adopt.mock.calls[0]?.[0]).not.toHaveProperty('prompt')
  expect(mocks.appendDraft).toHaveBeenCalledOnce()
  expect(mocks.appendDraft).toHaveBeenCalledWith('agent-session:chat-child', 'Fix #1')
  expect(mocks.setTitle.mock.calls[0]?.slice(1, 2)).toEqual(['Fix finding'])
  expect(mocks.refresh).toHaveBeenCalledWith(target, 'wt-1')
})

it('opens a clean branch as a new chat and links it after', async () => {
  await startConversationBranchInChat(target, { ...request, mode: 'clean' })
  expect(mocks.calls).toEqual(['open', 'prepare'])
  expect(mocks.adopt.mock.calls[0]?.[0]).not.toHaveProperty('resumeFrom')
  expect(mocks.prepare.mock.calls[0]?.[1]).toMatchObject({
    childStructuredSessionId: 'chat-child'
  })
})

it('opens nothing when the fork is refused', async () => {
  mocks.prepare.mockRejectedValueOnce(new Error('conversation_branch_source_busy'))
  await expect(startConversationBranchInChat(target, { ...request, mode: 'full' })).rejects.toThrow(
    'conversation_branch_source_busy'
  )
  expect(mocks.begin).not.toHaveBeenCalled()
  expect(mocks.refresh).toHaveBeenCalled()
})
