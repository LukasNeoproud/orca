// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import { useAgentContextOwnerAvailable } from './use-agent-context-owner-capability'

const supports = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/runtime-rpc-client', () => ({
  runtimeEnvironmentSupportsCapability: supports
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('useAgentContextOwnerAvailable', () => {
  it('enables a paired pane when its owner supports transitions and local policy is off', async () => {
    supports.mockResolvedValue(true)
    const hook = renderHook(() =>
      useAgentContextOwnerAvailable({ kind: 'environment', environmentId: 'host-1' }, false)
    )

    await waitFor(() => expect(hook.result.current).toBe(true))
    expect(supports).toHaveBeenCalledWith(
      'host-1',
      AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY,
      15_000
    )
  })

  it('disables a paired pane when its owner lacks the capability', async () => {
    supports.mockResolvedValue(false)
    const hook = renderHook(() =>
      useAgentContextOwnerAvailable({ kind: 'environment', environmentId: 'host-2' }, true)
    )

    await waitFor(() => expect(supports).toHaveBeenCalledOnce())
    expect(hook.result.current).toBe(false)
  })

  it('keeps the local pane under the local policy', () => {
    const hook = renderHook(() => useAgentContextOwnerAvailable({ kind: 'local' }, false))

    expect(hook.result.current).toBe(false)
    expect(supports).not.toHaveBeenCalled()
  })
})
