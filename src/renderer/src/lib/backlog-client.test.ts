import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBacklogTask, subscribeBacklog } from './backlog-client'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  route: { workspaceId: 'a', executionHostId: 'local', runtimeEnvironmentId: null }
}))
vi.mock('./backlog-board-client', () => ({ openBacklogBoard: vi.fn() }))
vi.mock('./backlog-rpc', () => ({
  resolveBacklogRoute: (workspaceId: string) => ({ ...mocks.route, workspaceId }),
  backlogRouteKey: (route: unknown) => JSON.stringify(route),
  callBacklog: mocks.call
}))

describe('Backlog sidebar subscriptions', () => {
  const releases: (() => void)[] = []
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.route.executionHostId = 'local'
    mocks.call.mockResolvedValue({ state: 'ready', tasks: [] })
  })
  afterEach(async () => {
    for (const release of releases.splice(0)) {
      release()
    }
    await Promise.resolve()
    vi.useRealTimers()
  })

  it('shares a host-scoped polling lease and releases only the final listener', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const releaseFirst = subscribeBacklog('a', first)
    const releaseSecond = subscribeBacklog('a', second)
    releases.push(releaseSecond)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.call.mock.calls.filter((call) => call[1] === 'snapshot')).toHaveLength(1)
    releaseFirst()
    expect(mocks.call.mock.calls.filter((call) => call[1] === 'releaseSnapshot')).toHaveLength(0)
    releaseSecond()
    expect(mocks.call.mock.calls.filter((call) => call[1] === 'releaseSnapshot')).toHaveLength(1)
  })

  it('never publishes an old pending response after unsubscribe', async () => {
    let finish!: (value: unknown) => void
    mocks.call.mockImplementation((_route, action) =>
      action === 'snapshot'
        ? new Promise((resolve) => {
            finish = resolve
          })
        : Promise.resolve()
    )
    const listener = vi.fn()
    const release = subscribeBacklog('a', listener)
    release()
    listener.mockClear()
    finish({ state: 'ready', tasks: [{ id: 'OLD', title: 'Old', status: 'Done', priority: null }] })
    await vi.advanceTimersByTimeAsync(0)
    expect(listener).not.toHaveBeenCalled()
    expect(mocks.call.mock.calls.filter((call) => call[1] === 'releaseSnapshot')).toHaveLength(2)
  })

  it('keeps last data stale after a transport failure', async () => {
    const task = { id: 'TASK-1', title: 'Work', status: 'To Do', priority: null }
    mocks.call
      .mockResolvedValueOnce({ state: 'ready', tasks: [task] })
      .mockRejectedValueOnce(new Error('Connection lost'))
    const listener = vi.fn()
    releases.push(subscribeBacklog('a', listener))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(listener).toHaveBeenLastCalledWith({
      state: 'error',
      stale: true,
      tasks: [task],
      error: 'Connection lost'
    })
  })

  it('isolates the same workspace id on different hosts', async () => {
    releases.push(subscribeBacklog('a', vi.fn()))
    mocks.route.executionHostId = 'ssh:another'
    releases.push(subscribeBacklog('a', vi.fn()))
    await vi.advanceTimersByTimeAsync(0)
    const calls = mocks.call.mock.calls.filter((call) => call[1] === 'snapshot')
    expect(calls).toHaveLength(2)
    expect(calls[0][0].executionHostId).toBe('local')
    expect(calls[1][0].executionHostId).toBe('ssh:another')
  })

  it('routes task detail with an explicit owner and task id', async () => {
    await readBacklogTask('a', 'TASK-1')
    expect(mocks.call).toHaveBeenCalledWith(mocks.route, 'task', { taskId: 'TASK-1' })
  })
})
