import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BacklogTaskAssociation } from '../../../src/shared/backlog-task-association'
import { continueMobileBacklogTask } from './mobile-backlog-task-continue'

const mocks = vi.hoisted(() => ({ activate: vi.fn(), openHistory: vi.fn() }))
vi.mock('../session/mobile-session-tab-activation', () => ({
  activateMobileSessionTab: mocks.activate
}))
vi.mock('../agent-history/open-mobile-agent-history-session', () => ({
  openMobileAgentHistorySession: mocks.openHistory
}))

const ok = (result: unknown) => ({ id: '1', ok: true as const, result })

function savedAssociation(executionHostId: BacklogTaskAssociation['executionHostId'] = 'local') {
  return {
    projectId: 'project-1',
    executionHostId,
    taskId: 'TASK-20',
    sourceWorkspace: { workspaceId: 'wt-1', kind: 'git-worktree' as const },
    targetWorkspace: { workspaceId: 'wt-2', kind: 'git-worktree' as const },
    session: {
      title: 'Codex',
      agent: 'codex',
      providerSession: { key: 'session_id' as const, id: 'provider-1' }
    },
    terminal: { tabId: 'tab-1', launchAgent: 'codex' as const },
    attemptId: 'attempt-1',
    deliveryStatus: 'unverified' as const,
    createdAt: 1,
    updatedAt: 2
  }
}

function worktrees(hostId: 'local' | `ssh:${string}` = 'local') {
  return ok({
    worktrees: [
      { worktreeId: 'wt-1', repoId: 'repo-1', hostId, path: '/repo/one' },
      { worktreeId: 'wt-2', repoId: 'repo-1', hostId, path: '/repo/two' }
    ]
  })
}

describe('continueMobileBacklogTask', () => {
  beforeEach(() => {
    mocks.activate.mockReset().mockResolvedValue(ok({}))
    mocks.openHistory.mockReset()
  })

  it('opens the exact active terminal association without sending the task again', async () => {
    const association = savedAssociation()
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'backlog.taskAssociations.get') {
        return ok({ association })
      }
      if (method === 'worktree.ps') {
        return worktrees()
      }
      if (method === 'session.tabs.list') {
        return ok({
          tabs: [
            {
              type: 'terminal',
              id: 'tab-1',
              title: 'Codex',
              terminal: 'term-1',
              launchAgent: 'codex',
              agentStatus: {
                agentType: 'codex',
                paneKey: 'tab-1:leaf-1',
                providerSession: { key: 'session_id', id: 'provider-1' }
              },
              isActive: false
            }
          ]
        })
      }
      throw new Error(`Unexpected ${method}`)
    })

    const outcome = await continueMobileBacklogTask({
      client: { sendRequest } as never,
      sourceWorkspaceId: 'wt-1',
      association
    })

    expect(outcome.status).toBe('activated')
    expect(mocks.activate).toHaveBeenCalledOnce()
    expect(sendRequest.mock.calls.some(([method]) => method === 'terminal.send')).toBe(false)
    expect(sendRequest.mock.calls.some(([method]) => method === 'backlog.task')).toBe(false)
  })

  it('does not claim a structured conversation opened when the host refuses reveal', async () => {
    const association: BacklogTaskAssociation = {
      ...savedAssociation(),
      session: { ...savedAssociation().session, structuredSessionId: 'structured-1' }
    }
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'backlog.taskAssociations.get') {
        return ok({ association })
      }
      if (method === 'worktree.ps') {
        return worktrees()
      }
      if (method === 'session.tabs.list') {
        return ok({
          tabs: [
            {
              type: 'agent-session',
              id: 'agent-session:structured-1',
              sessionId: 'structured-1',
              agent: 'codex',
              isActive: false
            }
          ]
        })
      }
      if (method === 'agentSession.reveal') {
        return ok({ ok: false, refusal: { message: 'This chat is no longer on this host.' } })
      }
      throw new Error(`Unexpected ${method}`)
    })
    const outcome = await continueMobileBacklogTask({
      client: { sendRequest } as never,
      sourceWorkspaceId: 'wt-1',
      association
    })
    expect(outcome.status).toBe('unverifiable')
  })

  it('keeps a missing SSH conversation unverifiable without local history fallback', async () => {
    const association = savedAssociation('ssh:builder')
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'backlog.taskAssociations.get') {
        return ok({ association })
      }
      if (method === 'worktree.ps') {
        return worktrees('ssh:builder')
      }
      if (method === 'session.tabs.list') {
        return ok({ tabs: [] })
      }
      throw new Error(`Unexpected ${method}`)
    })

    const outcome = await continueMobileBacklogTask({
      client: { sendRequest } as never,
      sourceWorkspaceId: 'wt-1',
      association
    })

    expect(outcome.status).toBe('unverifiable')
    expect(sendRequest.mock.calls.some(([method]) => method === 'aiVault.listSessions')).toBe(false)
    expect(mocks.openHistory).not.toHaveBeenCalled()
  })

  it('restores a verified local provider session without resending the task', async () => {
    const association = savedAssociation()
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'backlog.taskAssociations.get') {
        return ok({ association })
      }
      if (method === 'worktree.ps') {
        return worktrees()
      }
      if (method === 'session.tabs.list') {
        return ok({ tabs: [] })
      }
      if (method === 'status.get') {
        return ok({ capabilities: [], hostPlatform: 'darwin' })
      }
      if (method === 'aiVault.listSessions') {
        return ok({
          sessions: [
            {
              id: 'history-1',
              sessionId: 'provider-1',
              agent: 'codex',
              filePath: '/repo/two/.codex/session.jsonl',
              cwd: '/repo/two',
              executionHostId: 'local',
              title: 'Codex'
            }
          ],
          issues: []
        })
      }
      throw new Error(`Unexpected ${method}`)
    })
    mocks.openHistory.mockResolvedValue({
      kind: 'opened',
      message: 'Agent session queued.',
      worktreeId: 'wt-2'
    })

    const outcome = await continueMobileBacklogTask({
      client: { sendRequest } as never,
      sourceWorkspaceId: 'wt-1',
      association
    })

    expect(outcome.status).toBe('restored')
    expect(mocks.openHistory).toHaveBeenCalledOnce()
    expect(sendRequest).toHaveBeenCalledWith(
      'aiVault.listSessions',
      { unlimited: true, force: true, scopePaths: ['/repo/two'] },
      { timeoutMs: 30_000, budgetSpansConnect: true }
    )
    expect(sendRequest.mock.calls.some(([method]) => method === 'terminal.send')).toBe(false)
  })
})
