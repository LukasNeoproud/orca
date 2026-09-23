import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BacklogTaskAssociation } from '../../../src/shared/backlog-task-association'
import { startMobileBacklogTask } from './mobile-backlog-task-launch'

const mocks = vi.hoisted(() => ({
  terminalSend: vi.fn(),
  activate: vi.fn(),
  createStructured: vi.fn()
}))

vi.mock('../session/mobile-native-chat-send', () => ({
  sendMobileNativeChatMessageWithOutcome: mocks.terminalSend
}))
vi.mock('../session/mobile-session-tab-activation', () => ({
  activateMobileSessionTab: mocks.activate
}))
vi.mock('../session/mobile-structured-agent-session-launch', () => ({
  createMobileStructuredAgentSession: mocks.createStructured
}))

const ok = (result: unknown) => ({ id: '1', ok: true as const, result })

function association(
  status: BacklogTaskAssociation['deliveryStatus'],
  overrides: Partial<BacklogTaskAssociation> = {}
): BacklogTaskAssociation {
  return {
    projectId: 'project-1',
    executionHostId: 'local',
    taskId: 'TASK-20',
    sourceWorkspace: { workspaceId: 'wt-1', kind: 'git-worktree' },
    targetWorkspace: { workspaceId: 'wt-2', kind: 'git-worktree' },
    session: { title: 'Fresh title', agent: 'codex', structuredSessionId: 'session-1' },
    attemptId: 'attempt-1',
    deliveryStatus: status,
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  }
}

function worktreeResult() {
  return ok({
    worktrees: [
      {
        worktreeId: 'wt-1',
        repoId: 'repo-1',
        hostId: 'local',
        path: '/repo/one'
      },
      {
        worktreeId: 'wt-2',
        repoId: 'repo-1',
        hostId: 'local',
        path: '/repo/two'
      }
    ]
  })
}

describe('startMobileBacklogTask', () => {
  beforeEach(() => {
    mocks.terminalSend.mockReset()
    mocks.activate.mockReset().mockResolvedValue(ok({}))
    mocks.createStructured.mockReset()
  })

  it('saves pending before one structured send, then confirms an accepted delivery', async () => {
    const calls: string[] = []
    const pending = association('pending')
    const confirmed = association('confirmed')
    const sendRequest = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      calls.push(method)
      if (method === 'worktree.ps') {
        return worktreeResult()
      }
      if (method === 'backlog.task') {
        return ok({
          id: 'TASK-20',
          title: 'Fresh title',
          status: 'To Do',
          description: 'Fresh description',
          acceptanceCriteria: [{ index: 1, text: 'Fresh criterion', checked: false }]
        })
      }
      if (method === 'session.tabs.list') {
        return ok({
          tabs: [
            {
              type: 'agent-session',
              id: 'agent-session:session-1',
              title: 'Existing chat',
              sessionId: 'session-1',
              agent: 'codex',
              isActive: false
            }
          ]
        })
      }
      if (method === 'agentSession.history') {
        return ok({ ok: true, page: { fence: 7 } })
      }
      if (method === 'backlog.taskAssociations.upsert') {
        expect(params?.deliveryStatus).toBe('pending')
        return ok({ association: pending })
      }
      if (method === 'agentSession.send') {
        const text = JSON.stringify(params)
        expect(text).toContain('Fresh description')
        expect(text).toContain('Fresh criterion')
        return ok({ ok: true, value: { submission: { dispatchState: 'accepted' } } })
      }
      if (method === 'backlog.taskAssociations.confirm') {
        return ok({ association: confirmed })
      }
      if (method === 'agentSession.reveal') {
        return ok({ ok: true })
      }
      throw new Error(`Unexpected ${method}`)
    })

    const outcome = await startMobileBacklogTask({
      client: { sendRequest } as never,
      sourceWorkspaceId: 'wt-1',
      taskId: 'TASK-20',
      targetWorkspaceId: 'wt-2',
      conversation: {
        kind: 'existing',
        conversation: {
          id: 'structured:session-1',
          title: 'Existing chat',
          surface: 'structured',
          agent: 'codex',
          session: { structuredSessionId: 'session-1', agent: 'codex' }
        }
      },
      expectedAttemptId: null,
      createAttemptId: () => 'attempt-1'
    })

    expect(outcome.delivery).toBe('confirmed')
    expect(calls.indexOf('backlog.taskAssociations.upsert')).toBeLessThan(
      calls.indexOf('agentSession.send')
    )
    expect(calls.filter((method) => method === 'agentSession.send')).toHaveLength(1)
  })

  it('keeps an ambiguous terminal attempt unverified and never resends it', async () => {
    const pending = association('pending', {
      session: { title: 'Codex', agent: 'codex' },
      terminal: { tabId: 'tab-1', launchAgent: 'codex' }
    })
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'worktree.ps') {
        return worktreeResult()
      }
      if (method === 'backlog.task') {
        return ok({ id: 'TASK-20', title: 'Fresh title', status: 'To Do' })
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
              isActive: false
            }
          ]
        })
      }
      if (method === 'backlog.taskAssociations.upsert') {
        return ok({ association: pending })
      }
      throw new Error(`Unexpected ${method}`)
    })
    mocks.terminalSend.mockResolvedValue('unknown')

    const outcome = await startMobileBacklogTask({
      client: { sendRequest } as never,
      sourceWorkspaceId: 'wt-1',
      taskId: 'TASK-20',
      targetWorkspaceId: 'wt-2',
      conversation: {
        kind: 'existing',
        conversation: {
          id: 'terminal:tab-1:',
          title: 'Codex',
          surface: 'terminal',
          agent: 'codex',
          session: { agent: 'codex' },
          terminal: { tabId: 'tab-1', launchAgent: 'codex' },
          terminalHandle: 'term-1'
        }
      },
      expectedAttemptId: null,
      createAttemptId: () => 'attempt-1'
    })

    expect(outcome.delivery).toBe('unverified')
    expect(outcome.association.deliveryStatus).toBe('pending')
    expect(mocks.terminalSend).toHaveBeenCalledOnce()
    expect(
      sendRequest.mock.calls.some(([method]) => method === 'backlog.taskAssociations.confirm')
    ).toBe(false)
  })
})
