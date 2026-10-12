import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMobileBacklog } from './use-mobile-backlog'

const transport = vi.hoisted(() => ({
  client: null as { sendRequest: ReturnType<typeof vi.fn> } | null,
  state: 'connected' as string,
  reconnect: vi.fn()
}))

vi.mock('../transport/client-context', () => ({
  useHostClient: () => ({ client: transport.client, state: transport.state }),
  useForceReconnect: () => transport.reconnect
}))

function ok(result: unknown) {
  return { id: 'response', ok: true as const, result, _meta: { runtimeId: 'runtime' } }
}

let latest: ReturnType<typeof useMobileBacklog> | null = null

function Harness({ worktreeId }: { worktreeId: string }) {
  latest = useMobileBacklog('paired-host', worktreeId)
  return null
}

afterEach(() => {
  transport.client = null
  transport.state = 'connected'
  transport.reconnect.mockReset()
  latest = null
})

describe('mobile Backlog lease', () => {
  it('loads a folder workspace through host RPC and releases its lease on unmount', async () => {
    const sendRequest = vi.fn(async (method: string, _params?: unknown) =>
      ok(
        method === 'status.get'
          ? { capabilities: ['backlog.v1', 'backlog.task-associations.v1'] }
          : {
              state: 'ready',
              tasks: [{ id: 'TASK-1', title: 'One', status: 'To Do', priority: null }]
            }
      )
    )
    transport.client = { sendRequest }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness, { worktreeId: 'folder:workspace-1' }))
    })
    expect(sendRequest).toHaveBeenCalledWith('backlog.snapshot', {
      workspaceId: 'folder:workspace-1',
      leaseId: expect.any(String)
    })
    expect(latest?.taskActionsSupported).toBe(true)
    const snapshotParams = sendRequest.mock.calls.find(
      ([method]) => method === 'backlog.snapshot'
    )?.[1] as { leaseId?: string } | undefined
    const leaseId = snapshotParams?.leaseId
    await act(async () => renderer.unmount())
    expect(sendRequest).toHaveBeenCalledWith('backlog.releaseSnapshot', {
      workspaceId: 'folder:workspace-1',
      leaseId
    })
  })

  it('does not call Backlog methods on an older host', async () => {
    const sendRequest = vi.fn(async (_method: string) => ok({ capabilities: [] }))
    transport.client = { sendRequest }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness, { worktreeId: 'repo::/worktree' }))
    })
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual(['status.get'])
    expect(latest?.taskActionsSupported).toBe(false)
    await act(async () => renderer.unmount())
  })
})
