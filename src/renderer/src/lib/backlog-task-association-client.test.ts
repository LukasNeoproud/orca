import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callBacklog } from './backlog-rpc'
import {
  readBacklogTaskAssociation,
  saveBacklogTaskAssociation
} from './backlog-task-association-client'

const mock = vi.hoisted(() => ({
  call: vi.fn(),
  assertCapability: vi.fn(),
  capabilities: ['backlog.v1'] as string[],
  refresh: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: vi.fn() } }))
vi.mock('./worktree-operation-route', () => ({ resolveWorktreeOperationRoute: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mock.call,
  assertRuntimeEnvironmentCapability: mock.assertCapability,
  RuntimeRpcCallError: class extends Error {
    code = 'method_not_found'
  }
}))
vi.mock('@/runtime/local-runtime-capabilities', () => ({
  readLocalRuntimeCapabilitiesOrUnknown: () => mock.capabilities,
  refreshLocalRuntimeCapabilities: mock.refresh
}))
const route = {
  workspaceId: 'source',
  executionHostId: 'local' as const,
  runtimeEnvironmentId: null
}

describe('Backlog association client compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.capabilities = ['backlog.v1']
    mock.call.mockResolvedValue({ association: null })
  })
  it('preserves reading tasks on older runtimes while refusing the new action', async () => {
    await callBacklog(route, 'task', { taskId: 'TASK-1' })
    expect(mock.call).toHaveBeenCalledTimes(1)
    await expect(readBacklogTaskAssociation(route, 'TASK-1')).rejects.toThrow('Update')
    expect(mock.call).toHaveBeenCalledTimes(1)
  })
  it('uses the pinned controlling runtime and source host for paired requests', async () => {
    const remoteRoute = {
      ...route,
      executionHostId: 'ssh:target' as const,
      runtimeEnvironmentId: 'owner'
    }
    await readBacklogTaskAssociation(remoteRoute, 'TASK-1')
    expect(mock.assertCapability).toHaveBeenCalledWith(
      'owner',
      'backlog.task-associations.v1',
      expect.any(String),
      15000
    )
    expect(mock.call).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'owner' },
      'backlog.taskAssociations.get',
      { workspaceId: 'source', executionHostId: 'ssh:target', taskId: 'TASK-1' },
      expect.any(Object)
    )
  })
  it('passes the attempt fence without dropping folder workspace identity', async () => {
    mock.capabilities.push('backlog.task-associations.v1')
    await saveBacklogTaskAssociation(route, {
      taskId: 'TASK-1',
      expectedAttemptId: 'previous',
      attemptId: 'next',
      targetWorkspace: { workspaceId: 'folder:f', kind: 'folder' },
      session: { structuredSessionId: 'session' },
      deliveryStatus: 'pending'
    })
    expect(mock.call).toHaveBeenCalledWith(
      { kind: 'local' },
      'backlog.taskAssociations.upsert',
      expect.objectContaining({
        expectedAttemptId: 'previous',
        targetWorkspace: { workspaceId: 'folder:f', kind: 'folder' }
      }),
      expect.any(Object)
    )
  })
})
