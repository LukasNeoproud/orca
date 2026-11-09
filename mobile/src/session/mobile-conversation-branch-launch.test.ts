import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchRecord } from '../../../src/shared/conversation-branch.test-fixture'
import type { RpcClient } from '../transport/rpc-client'

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  prepare: vi.fn(),
  recordReturn: vi.fn(),
  create: vi.fn(),
  reveal: vi.fn(async () => undefined),
  nextSessionId: 'chat-new'
}))

vi.mock('./mobile-conversation-branch-operations', () => ({
  conversationBranchList: { request: vi.fn(), interpret: vi.fn() },
  conversationBranchPrepare: {
    request: async (_client: unknown, params: unknown) => {
      mocks.calls.push('prepare')
      return mocks.prepare(params)
    },
    interpret: (reply: unknown) => reply
  },
  conversationBranchRecordReturn: {
    request: async (_client: unknown, params: unknown) => mocks.recordReturn(params),
    interpret: (reply: unknown) => reply
  }
}))
vi.mock('./mobile-structured-agent-session-launch', () => ({
  createMobileStructuredAgentSessionId: () => mocks.nextSessionId,
  createMobileStructuredAgentSession: async (
    _client: unknown,
    _worktree: string,
    _agent: string,
    options: unknown
  ) => {
    mocks.calls.push('create')
    return mocks.create(options)
  },
  revealMobileStructuredAgentSession: mocks.reveal
}))
vi.mock('./structured-session-operation-id', () => ({ structuredSessionRandomUuid: () => 'uuid' }))

import {
  resetMobileNativeChatDraftStoreForTests,
  setMobileNativeChatDraftText
} from './mobile-native-chat-draft-store'
import {
  returnMobileConversationBranchResult,
  startMobileConversationBranch
} from './mobile-conversation-branch-launch'

const scope = { client: {} as RpcClient, hostId: 'host', worktreeId: 'wt-1' }

/** The composer draft of the chat's tab, as its composer would read it. */
function draftOf(sessionId: string): string {
  let text = ''
  setMobileNativeChatDraftText(`host\0wt-1\0agent-session:${sessionId}`, (current) => {
    text = current
    return current
  })
  return text
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  resetMobileNativeChatDraftStoreForTests()
  mocks.create.mockImplementation(async () => ({ kind: 'created', sessionId: mocks.nextSessionId }))
})

const request = {
  requestId: 'r1',
  sourceSessionId: 'chat-parent',
  itemId: 'reply-1',
  label: 'Fix the parser',
  prompt: 'Fix finding 1 only.'
}

describe('startMobileConversationBranch', () => {
  it('forks first, then opens a chat resuming the fork with the prompt waiting in its composer', async () => {
    mocks.prepare.mockResolvedValue({ branch: branchRecord() })
    await startMobileConversationBranch(scope, { ...request, mode: 'full' })
    expect(mocks.calls).toEqual(['prepare', 'create'])
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { kind: 'chat', sessionId: 'chat-parent', itemId: 'reply-1' },
        surface: 'chat',
        mode: 'full'
      })
    )
    expect(mocks.create).toHaveBeenCalledWith({
      sessionId: 'chat-new',
      resumeFrom: { providerSessionId: 'child' }
    })
    expect(draftOf('chat-new')).toBe('Fix finding 1 only.')
  })

  it('opens a clean branch as a fresh chat and links it afterwards', async () => {
    mocks.prepare.mockResolvedValue({ branch: branchRecord({ mode: 'clean' }) })
    await startMobileConversationBranch(scope, { ...request, mode: 'clean' })
    expect(mocks.calls).toEqual(['create', 'prepare'])
    expect(mocks.create).toHaveBeenCalledWith({ sessionId: 'chat-new' })
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ childStructuredSessionId: 'chat-new' })
    )
  })
})

describe('returnMobileConversationBranchResult', () => {
  it('puts the result in the open parent chat as a draft and shows it', async () => {
    mocks.recordReturn.mockResolvedValue({ branch: branchRecord() })
    const outcome = await returnMobileConversationBranchResult(
      scope,
      [{ sessionId: 'chat-parent', providerSessionId: 'parent' }],
      branchRecord(),
      'Done.'
    )
    expect(draftOf('chat-parent')).toBe('Done.')
    expect(mocks.reveal).toHaveBeenCalledWith(scope.client, 'chat-parent')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(outcome).toEqual({ recorded: true })
  })

  it('resumes a parent with no chat holding the result, and still hands it back unrecorded', async () => {
    mocks.recordReturn.mockRejectedValue(new Error('offline'))
    const outcome = await returnMobileConversationBranchResult(scope, [], branchRecord(), 'Done.')
    expect(mocks.create).toHaveBeenCalledWith({
      sessionId: 'chat-new',
      resumeFrom: { providerSessionId: 'parent' }
    })
    expect(draftOf('chat-new')).toBe('Done.')
    expect(outcome).toEqual({ recorded: false })
  })
})
