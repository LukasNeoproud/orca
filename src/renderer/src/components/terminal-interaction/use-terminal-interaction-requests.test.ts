// @vitest-environment happy-dom

import { act, cleanup, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalInteractionPendingRequest } from '../../../../shared/terminal-interaction'

const runtimeMocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  supportsCapability: vi.fn(),
  appState: {
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    settings: null
  }
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: runtimeMocks.callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: runtimeMocks.supportsCapability
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(runtimeMocks.appState)
}))

import {
  readPendingTerminalInteractionRequests,
  useTerminalInteractionRequests
} from './use-terminal-interaction-requests'

const request: TerminalInteractionPendingRequest = {
  requestId: 'request-1',
  terminalHandle: 'terminal-1',
  paneKey: 'pane-1',
  request: { fields: [{ id: 'name', type: 'text', label: 'Name' }] },
  createdAt: 1
}

describe('readPendingTerminalInteractionRequests', () => {
  beforeEach(() => {
    runtimeMocks.callRuntimeRpc.mockReset()
    runtimeMocks.supportsCapability.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('reads local requests without a capability probe and records local routing', async () => {
    runtimeMocks.callRuntimeRpc.mockResolvedValue([request])

    await expect(readPendingTerminalInteractionRequests({ kind: 'local' })).resolves.toEqual([
      expect.objectContaining({ key: 'local:request-1', targetKey: 'local' })
    ])
    expect(runtimeMocks.supportsCapability).not.toHaveBeenCalled()
    expect(runtimeMocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'terminalInteraction.pending',
      undefined,
      expect.objectContaining({ timeoutMs: 5_000 })
    )
  })

  it('gates remote reads by capability and keeps exact environment routing', async () => {
    const target = { kind: 'environment' as const, environmentId: 'hub-1' }
    runtimeMocks.supportsCapability.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    runtimeMocks.callRuntimeRpc.mockResolvedValue([request])

    await expect(readPendingTerminalInteractionRequests(target)).resolves.toEqual([])
    expect(runtimeMocks.callRuntimeRpc).not.toHaveBeenCalled()
    await expect(readPendingTerminalInteractionRequests(target)).resolves.toEqual([
      expect.objectContaining({
        key: 'environment:hub-1:request-1',
        target,
        targetKey: 'environment:hub-1'
      })
    ])
  })

  it('signals transient failures without replacing the last successful rows', async () => {
    runtimeMocks.callRuntimeRpc.mockRejectedValue(new Error('offline'))

    await expect(readPendingTerminalInteractionRequests({ kind: 'local' })).resolves.toBeNull()
  })

  it('does not resurrect a response from an older pending poll', async () => {
    let resolveStalePoll: ((value: TerminalInteractionPendingRequest[]) => void) | undefined
    const stalePoll = new Promise<TerminalInteractionPendingRequest[]>((resolve) => {
      resolveStalePoll = resolve
    })
    runtimeMocks.callRuntimeRpc
      .mockResolvedValueOnce([request])
      .mockReturnValueOnce(stalePoll)
      .mockResolvedValueOnce({ accepted: true })
    let latest: ReturnType<typeof useTerminalInteractionRequests> | undefined
    function Probe(): null {
      latest = useTerminalInteractionRequests()
      return null
    }

    render(createElement(Probe))
    await waitFor(() => expect(latest?.requests).toHaveLength(1))
    await waitFor(() => expect(runtimeMocks.callRuntimeRpc).toHaveBeenCalledTimes(2), {
      timeout: 2_000
    })
    await act(async () => {
      await latest?.respond(latest.requests[0]!, { status: 'cancelled' })
    })
    expect(latest?.requests).toHaveLength(0)
    await act(async () => {
      resolveStalePoll?.([request])
      await stalePoll
    })
    expect(latest?.requests).toHaveLength(0)
  })
})
