import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { MethodHandler, RequestContext } from './dispatcher'
import { BacklogHandler } from './backlog-handler'

const mocks = vi.hoisted(() => ({
  realpath: vi.fn(async (path: string) => path.replace('/alias', '/canonical')),
  release: vi.fn(),
  subscribe: vi.fn(),
  acquireBoard: vi.fn(async () => ({
    url: 'http://127.0.0.1:40000',
    port: 40000,
    instanceId: 'one'
  })),
  releaseBoard: vi.fn(async () => {}),
  getTaskDetail: vi.fn(),
  dispose: vi.fn(async () => {}),
  spawn: vi.fn()
}))
vi.mock('node:fs/promises', () => ({ realpath: mocks.realpath }))
vi.mock('../main/backlog-runtime/backlog-process', () => ({ spawnBacklogProcess: mocks.spawn }))
vi.mock('../main/backlog/backlog-service', () => ({
  createBacklogService: () => ({
    subscribe: mocks.subscribe,
    acquireBoard: mocks.acquireBoard,
    releaseBoard: mocks.releaseBoard,
    getTaskDetail: mocks.getTaskDetail,
    dispose: mocks.dispose
  })
}))

describe('relay Backlog.md ownership', () => {
  const methods = new Map<string, MethodHandler>()
  let handler: BacklogHandler
  const context = { clientId: 1, isStale: () => false } as RequestContext
  const call = (name: string, params: Record<string, unknown>, ctx = context) =>
    methods.get(name)!(params, ctx)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    methods.clear()
    mocks.subscribe.mockImplementation((_target, listener) => {
      listener({ state: 'ready', tasks: [] })
      return mocks.release
    })
    handler = new BacklogHandler({
      onRequest: (name, callback) => {
        methods.set(name, callback)
      }
    })
  })
  afterEach(async () => {
    await handler.dispose()
    vi.useRealTimers()
  })

  it('probes capability without executing backlog', async () => {
    await expect(call('backlog.capabilities', {})).resolves.toEqual({
      capabilities: ['backlog.v1']
    })
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('renews one canonical watcher lease across reconnecting clients', async () => {
    const params = { cwd: '/alias/project', leaseId: 'panel' }
    await expect(call('backlog.snapshot', params)).resolves.toEqual({ state: 'ready', tasks: [] })
    await vi.advanceTimersByTimeAsync(20_000)
    await call(
      'backlog.snapshot',
      { ...params, cwd: '/canonical/project' },
      { ...context, clientId: 2 }
    )
    expect(mocks.subscribe).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(mocks.release).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('isolates projects and principals even with equal lease ids', async () => {
    await call('backlog.acquireBoard', { cwd: '/projects/a', leaseId: 'tab' })
    await call('backlog.acquireBoard', { cwd: '/projects/b', leaseId: 'tab' })
    await call(
      'backlog.acquireBoard',
      { cwd: '/projects/a', leaseId: 'tab' },
      {
        ...context,
        sessionIdentity: {
          principal: 'another',
          authenticated: true,
          allowSessionOwner: false,
          authenticationKind: 'endpoint-credential'
        }
      }
    )
    const leases = mocks.acquireBoard.mock.calls as unknown as [unknown, string][]
    expect(new Set(leases.map((args) => args[1])).size).toBe(3)
  })

  it('rejects relative paths before starting processes', async () => {
    await expect(call('backlog.acquireBoard', { cwd: 'project', leaseId: 'tab' })).rejects.toThrow(
      'absolute'
    )
    expect(mocks.acquireBoard).not.toHaveBeenCalled()
  })
})
