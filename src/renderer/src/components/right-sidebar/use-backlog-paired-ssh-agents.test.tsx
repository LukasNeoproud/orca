// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mock.call }))
import { useBacklogPairedSshAgents } from './use-backlog-paired-ssh-agents'
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
describe('Backlog agents behind paired SSH', () => {
  it('pins detection to the controlling runtime and drops late results for another host', async () => {
    let finish!: (ids: string[]) => void
    mock.call
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce(['claude'])
    const { result, rerender } = renderHook(
      ({ environment, connection }) => useBacklogPairedSshAgents(environment, connection),
      { initialProps: { environment: 'first', connection: 'ssh-a' } }
    )
    expect(mock.call).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'first' },
      'preflight.detectRemoteAgents',
      { connectionId: 'ssh-a' }
    )
    rerender({ environment: 'second', connection: 'ssh-b' })
    await waitFor(() => expect(result.current.detectedIds).toEqual(['claude']))
    await act(async () => finish(['codex']))
    expect(result.current.detectedIds).toEqual(['claude'])
  })
  it('keeps a disconnected host unknown without falling back to local agents', async () => {
    mock.call.mockRejectedValue(new Error('Disconnected'))
    const { result } = renderHook(() => useBacklogPairedSshAgents('owner', 'ssh'))
    await waitFor(() => expect(result.current.detectionFailed).toBe(true))
    expect(result.current.detectedIds).toBeNull()
    expect(mock.call).toHaveBeenCalledTimes(1)
  })
})
