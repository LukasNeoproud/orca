import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchPortableConversationBranch } from './portable-conversation-branch-launch'
const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  complete: vi.fn(),
  launch: vi.fn(),
  send: vi.fn(),
  identity: vi.fn()
}))
vi.mock('./terminal-provider-session-identity', () => ({
  waitForTerminalProviderSession: mocks.identity
}))
vi.mock('./portable-conversation-branch-client', () => ({
  branchBeginStartPortableConversation: mocks.begin,
  branchCompleteStartPortableConversation: mocks.complete
}))
vi.mock('./launch-agent-background-session', () => ({ launchAgentBackgroundSession: mocks.launch }))
vi.mock('./agent-launch-prompt-delivery', () => ({ deliverLaunchPromptToAgentTab: mocks.send }))
const target = { kind: 'environment' as const, environmentId: 'peer' }
const branch = {
  branchId: 'branch',
  title: 'Investigate',
  target: {
    agent: 'claude',
    terminal: {
      workspace: {
        workspaceId: 'folder:project',
        executionHostId: 'ssh:remote'
      }
    }
  },
  handoff: { content: 'Exact **edited** handoff\n- [x] verified' },
  state: 'delivery-unverified'
}
describe('portable conversation launch delivery boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.begin.mockResolvedValue({ authorized: true, branch })
    mocks.complete.mockResolvedValue({ branch })
    mocks.launch.mockResolvedValue({ tabId: 'tab', paneKey: 'tab:leaf', ptyId: 'pty' })
    mocks.send.mockResolvedValue(true)
    mocks.identity.mockResolvedValue(undefined)
  })
  it('pins the execution owner and persists navigation before sending exactly the saved content', async () => {
    expect(await launchPortableConversationBranch(target, 'branch', 'attempt')).toBe(branch)
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        executionHostId: 'ssh:remote',
        runtimeEnvironmentId: 'peer',
        worktreeId: 'folder:project'
      })
    )
    expect(mocks.launch.mock.calls[0][0]).not.toHaveProperty('prompt')
    expect(mocks.complete).toHaveBeenCalledWith(target, {
      branchId: 'branch',
      attemptId: 'attempt',
      outcome: {
        kind: 'launched',
        receipt: {
          tabId: 'tab',
          paneKey: 'tab:leaf',
          ptyId: 'pty',
          leafId: 'leaf'
        }
      }
    })
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      tabId: 'tab',
      agent: 'claude',
      content: branch.handoff.content,
      submit: true,
      forcePaste: true
    })
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.launch.mock.invocationCallOrder[0]
    )
    expect(mocks.complete.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0]
    )
  })
  it('enriches the same attempt with provider identity without acknowledging or resending', async () => {
    const providerSession = { id: 'provider', transcriptPath: '/history/session.jsonl' }
    mocks.identity.mockResolvedValue(providerSession)
    await launchPortableConversationBranch(target, 'branch', 'attempt')
    expect(mocks.complete).toHaveBeenCalledTimes(2)
    expect(mocks.complete.mock.calls[1][1]).toMatchObject({
      branchId: 'branch',
      attemptId: 'attempt',
      outcome: { kind: 'launched', receipt: { providerSession } }
    })
    expect(mocks.complete.mock.calls[1][1].outcome).not.toHaveProperty('acknowledged')
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.launch).toHaveBeenCalledTimes(1)
  })
  it('captures a late provider identity after returning without a second launch or send', async () => {
    vi.useFakeTimers()
    try {
      let identify!: (value: { id: string; transcriptPath: string }) => void
      mocks.identity.mockReturnValue(
        new Promise((resolve) => {
          identify = resolve
        })
      )
      const pending = launchPortableConversationBranch(target, 'branch', 'attempt')
      await vi.advanceTimersByTimeAsync(15_000)
      expect(await pending).toBe(branch)
      identify({ id: 'late-provider', transcriptPath: '/history/late.jsonl' })
      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.complete).toHaveBeenCalledTimes(2)
      expect(mocks.complete.mock.calls[1][1]).toMatchObject({
        attemptId: 'attempt',
        outcome: { receipt: { providerSession: { id: 'late-provider' } } }
      })
      expect(mocks.launch).toHaveBeenCalledTimes(1)
      expect(mocks.send).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it('does not launch or send for an already claimed attempt, including an explicit retry', async () => {
    mocks.begin.mockResolvedValue({ authorized: false, branch })
    await launchPortableConversationBranch(target, 'branch', 'attempt')
    await launchPortableConversationBranch(target, 'branch', 'new-attempt')
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('does not send when the receipt persistence reply is lost', async () => {
    mocks.complete.mockRejectedValue(new Error('disconnected'))
    await expect(launchPortableConversationBranch(target, 'branch', 'attempt')).rejects.toThrow(
      'disconnected'
    )
    expect(mocks.launch).toHaveBeenCalledTimes(1)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('retains the unknown claim after an ambiguous launch failure', async () => {
    mocks.launch.mockRejectedValue(new Error('SSH disconnected'))
    await expect(launchPortableConversationBranch(target, 'branch', 'attempt')).rejects.toThrow(
      'SSH disconnected'
    )
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('never reports a terminal write as an accepted agent submission', async () => {
    mocks.send.mockResolvedValue(false)
    await expect(launchPortableConversationBranch(target, 'branch', 'attempt')).rejects.toThrow(
      'delivery is unverified'
    )
    expect(mocks.complete).toHaveBeenCalledTimes(1)
    expect(mocks.complete.mock.calls[0][1].outcome).not.toHaveProperty('acknowledged')
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})
