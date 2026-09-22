// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ host: 'ssh:first' }))
vi.mock('@/lib/backlog-rpc', () => ({
  resolveBacklogRoute: (workspaceId: string) => ({
    workspaceId,
    executionHostId: mock.host,
    runtimeEnvironmentId: 'owner'
  })
}))
import {
  closeBacklogTaskStart,
  requestBacklogTaskStart,
  useBacklogTaskStartRequest
} from './backlog-task-start-request'
const task = { id: 'TASK-1', title: 'Task', status: 'To Do', priority: null }
afterEach(() => {
  cleanup()
  closeBacklogTaskStart()
})
describe('Backlog handoff request scope', () => {
  it('pins the source host and task while navigation changes, ignoring duplicate opens', () => {
    mock.host = 'ssh:first'
    const { result } = renderHook(useBacklogTaskStartRequest)
    act(() => requestBacklogTaskStart('source', task))
    mock.host = 'ssh:other'
    act(() => requestBacklogTaskStart('target', { ...task, id: 'TASK-2' }))
    expect(result.current).toEqual({
      route: { workspaceId: 'source', executionHostId: 'ssh:first', runtimeEnvironmentId: 'owner' },
      task
    })
    act(closeBacklogTaskStart)
    expect(result.current).toBeNull()
  })
})
