import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'

const { callRuntimeRpc, runtimeEnvironmentSupportsCapability } = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability
}))

import {
  cancelQualityGates,
  classifyQualityGateCallFailure,
  fetchQualityGateOutput,
  fetchQualityGateStatus,
  qualityGatesSupported,
  startQualityGates
} from './quality-gate-client'

const remote = { kind: 'environment', environmentId: 'env-ssh' } as const
const local = { kind: 'local' } as const

function refusal(code: string, message = code): RuntimeRpcCallError {
  return new RuntimeRpcCallError({
    id: 'req',
    ok: false,
    error: { code, message },
    _meta: { runtimeId: 'r' }
  })
}

describe('quality gate client', () => {
  beforeEach(() => {
    callRuntimeRpc.mockReset()
    callRuntimeRpc.mockResolvedValue({ runs: [] })
    runtimeEnvironmentSupportsCapability.mockReset()
  })

  it('runs the gates of a remote worktree on the host that owns it, not on this computer', async () => {
    await startQualityGates(remote, 'repo::/srv/app')
    await fetchQualityGateStatus(remote, 'repo::/srv/app')
    await fetchQualityGateOutput(remote, 'repo::/srv/app', 'run-1')
    await cancelQualityGates(remote, 'repo::/srv/app')

    expect(
      callRuntimeRpc.mock.calls.map(([target, method, params]) => [target, method, params])
    ).toEqual([
      [remote, 'qualityGates.run', { worktree: 'id:repo::/srv/app' }],
      [remote, 'qualityGates.status', { worktree: 'id:repo::/srv/app' }],
      [remote, 'qualityGates.output', { worktree: 'id:repo::/srv/app', runId: 'run-1' }],
      [remote, 'qualityGates.cancel', { worktree: 'id:repo::/srv/app' }]
    ])
  })

  it('names gates by id and never sends a command', async () => {
    await startQualityGates(local, 'repo::/work', ['lint'])
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      local,
      'qualityGates.run',
      { worktree: 'id:repo::/work', gateIds: ['lint'] },
      expect.anything()
    )
  })

  it('asks a remote host for the capability and reports an older host as unsupported', async () => {
    runtimeEnvironmentSupportsCapability.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    expect(await qualityGatesSupported(remote)).toBe(true)
    expect(await qualityGatesSupported(remote)).toBe(false)
    expect(runtimeEnvironmentSupportsCapability).toHaveBeenCalledWith(
      'env-ssh',
      'quality-gates.v1',
      expect.any(Number)
    )
  })

  it('never asks this app whether it supports its own gates', async () => {
    expect(await qualityGatesSupported(local)).toBe(true)
    expect(runtimeEnvironmentSupportsCapability).not.toHaveBeenCalled()
  })

  it('tells an older host, a lost host and a refusal apart', () => {
    expect(classifyQualityGateCallFailure(refusal('method_not_found'))).toBe('unsupported')
    expect(classifyQualityGateCallFailure(refusal('remote_runtime_unavailable'))).toBe(
      'contact-lost'
    )
    expect(classifyQualityGateCallFailure(refusal('runtime_timeout'))).toBe('contact-lost')
    expect(classifyQualityGateCallFailure(new Error('socket hang up'))).toBe('contact-lost')
    expect(classifyQualityGateCallFailure(refusal('runtime_error', 'no such gate'))).toBe('refused')
  })
})
