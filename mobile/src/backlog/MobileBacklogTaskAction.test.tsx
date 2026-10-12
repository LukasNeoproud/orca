import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBacklogTaskAction } from './MobileBacklogTaskAction'
import { hostType } from '../test-support/host-type-predicate'

const mocks = vi.hoisted(() => ({
  readAssociation: vi.fn(),
  continueTask: vi.fn(),
  routerPush: vi.fn(),
  client: { sendRequest: vi.fn() }
}))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View'
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.routerPush }) }))
vi.mock('../platform/haptics', () => ({ triggerError: vi.fn(), triggerSuccess: vi.fn() }))
vi.mock('../transport/client-context', () => ({
  useHostClient: () => ({ client: mocks.client, state: 'connected' })
}))
vi.mock('./mobile-backlog-task-association-client', () => ({
  readMobileBacklogTaskAssociation: mocks.readAssociation
}))
vi.mock('./mobile-backlog-task-continue', () => ({
  continueMobileBacklogTask: mocks.continueTask
}))
vi.mock('./MobileBacklogTaskLaunchSheet', () => ({
  MobileBacklogTaskLaunchSheet: 'MobileBacklogTaskLaunchSheet'
}))
vi.mock('./mobile-backlog-styles', () => ({ backlogStyles: {} }))
vi.mock('../theme/mobile-theme', () => ({ colors: { bgBase: '#111', textSecondary: '#999' } }))

const task = { id: 'TASK-20', title: 'Start it', status: 'To Do', priority: null }
const association = {
  projectId: 'project-1',
  executionHostId: 'local' as const,
  taskId: 'TASK-20',
  sourceWorkspace: { workspaceId: 'wt-1', kind: 'git-worktree' as const },
  targetWorkspace: { workspaceId: 'wt-2', kind: 'git-worktree' as const },
  session: { title: 'Codex', agent: 'codex' },
  terminal: { tabId: 'tab-1', launchAgent: 'codex' as const },
  attemptId: 'attempt-1',
  deliveryStatus: 'unverified' as const,
  createdAt: 1,
  updatedAt: 2
}

async function renderAction(supported: boolean | null): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      createElement(MobileBacklogTaskAction, {
        hostId: 'host-1',
        sourceWorkspaceId: 'wt-1',
        task,
        supported
      })
    )
  })
  return renderer
}

describe('MobileBacklogTaskAction', () => {
  beforeEach(() => {
    mocks.readAssociation.mockReset().mockResolvedValue(association)
    mocks.continueTask.mockReset().mockResolvedValue({
      association,
      status: 'activated',
      message: 'Linked conversation opened.',
      worktreeId: 'wt-2'
    })
    mocks.routerPush.mockReset()
  })

  it('continues an unverified association without sending the task again', async () => {
    const renderer = await renderAction(true)
    expect(JSON.stringify(renderer.toJSON())).toContain('Continue will not resend')
    const button = renderer.root
      .findAll(hostType('Pressable'))
      .find((node) =>
        node.findAll(hostType('Text')).some((text) => text.props.children === 'Continue')
      )
    await act(async () => button?.props.onPress())

    expect(mocks.continueTask).toHaveBeenCalledOnce()
    expect(mocks.routerPush).toHaveBeenCalledWith('/h/host-1/session/wt-2')
  })

  it('shows an update requirement without calling association RPC on an older host', async () => {
    const renderer = await renderAction(false)
    expect(JSON.stringify(renderer.toJSON())).toContain('Host update required')
    expect(mocks.readAssociation).not.toHaveBeenCalled()
  })
})
