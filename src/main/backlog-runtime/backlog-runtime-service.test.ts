import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

const mocks = vi.hoisted(() => ({
  resolveTarget: vi.fn(),
  subscribe: vi.fn(),
  release: vi.fn(),
  getTask: vi.fn(),
  releaseTarget: vi.fn(async () => {})
}))

vi.mock('./backlog-target', () => ({ resolveBacklogTarget: mocks.resolveTarget }))
vi.mock('../backlog/backlog-service', () => ({
  createBacklogService: () => ({
    subscribe: mocks.subscribe,
    getTaskDetail: mocks.getTask,
    acquireBoard: vi.fn(),
    releaseBoard: vi.fn(),
    releaseTarget: mocks.releaseTarget,
    dispose: vi.fn()
  })
}))

import {
  getBacklogSnapshot,
  getBacklogTask,
  releaseBacklogSnapshot,
  releaseBacklogWorkspace
} from './backlog-runtime-service'

const runtime = {} as OrcaRuntimeService
const localTarget = {
  kind: 'local',
  workspaceId: 'work',
  executionHostId: 'local',
  target: { key: 'local\0/work', spawn: vi.fn() }
} as const
beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveTarget.mockResolvedValue(localTarget)
  mocks.subscribe.mockImplementation((_target, callback) => {
    callback({ state: 'loading', tasks: [] })
    callback({
      state: 'ready',
      tasks: [{ id: '1', title: 'Task', status: 'Open', priority: null }]
    })
    return mocks.release
  })
})

describe('Backlog runtime leases', () => {
  it('reuses a subscribed target and releases without rescanning a removed workspace', async () => {
    await getBacklogSnapshot(runtime, 'work', 'consumer')
    const second = await getBacklogSnapshot(runtime, 'work', 'consumer')
    expect(second.state).toBe('ready')
    expect(mocks.resolveTarget).toHaveBeenCalledOnce()
    expect(mocks.subscribe).toHaveBeenCalledOnce()
    await releaseBacklogSnapshot(runtime, 'work', 'consumer')
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.resolveTarget).toHaveBeenCalledOnce()
  })

  it('releases every remembered folder path after a retarget and deletion', async () => {
    const old = {
      ...localTarget,
      workspaceId: 'folder:one',
      target: { key: 'local\0/old', spawn: vi.fn() }
    }
    const next = {
      ...localTarget,
      workspaceId: 'folder:one',
      target: { key: 'local\0/new', spawn: vi.fn() }
    }
    mocks.resolveTarget.mockResolvedValueOnce(old).mockResolvedValueOnce(next)
    mocks.getTask.mockResolvedValue({ id: '1' })
    await getBacklogTask(runtime, 'folder:one', '1')
    await getBacklogTask(runtime, 'folder:one', '1')
    await releaseBacklogWorkspace('folder:one')
    expect(mocks.releaseTarget).toHaveBeenCalledWith(old.target)
    expect(mocks.releaseTarget).toHaveBeenCalledWith(next.target)
    expect(mocks.releaseTarget).toHaveBeenCalledTimes(2)
  })

  it('drains a pending old-path resolution before completing folder retirement', async () => {
    const old = {
      ...localTarget,
      workspaceId: 'folder:pending',
      target: { key: 'local\0/old-pending', spawn: vi.fn() }
    }
    let finishResolution!: (target: typeof old) => void
    mocks.resolveTarget.mockReturnValueOnce(
      new Promise((resolve) => {
        finishResolution = resolve
      })
    )
    const snapshot = getBacklogSnapshot(runtime, 'folder:pending', 'lease')
    const retirement = releaseBacklogWorkspace('folder:pending')
    expect(mocks.releaseTarget).not.toHaveBeenCalled()
    await expect(getBacklogSnapshot(runtime, 'folder:pending', 'later')).rejects.toThrow(
      'backlog_workspace_retiring'
    )
    finishResolution(old)
    await snapshot
    await retirement
    expect(mocks.releaseTarget).toHaveBeenCalledWith(old.target)
    expect(mocks.releaseTarget.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.subscribe.mock.invocationCallOrder[0]!
    )
  })
})
