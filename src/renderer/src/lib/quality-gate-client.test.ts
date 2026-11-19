import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'

const { callRuntimeRpc, runtimeEnvironmentSupportsCapability, subscribeRuntimeRpc } = vi.hoisted(
  () => ({
    callRuntimeRpc: vi.fn(),
    runtimeEnvironmentSupportsCapability: vi.fn(),
    subscribeRuntimeRpc: vi.fn()
  })
)
vi.mock('@/runtime/runtime-rpc-subscribe', () => ({ subscribeRuntimeRpc }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability
}))

import {
  cancelQualityGates,
  classifyQualityGateCallFailure,
  fetchQualityGateOutput,
  fetchQualityGateStatus,
  qualityGateBackgroundChangesSupported,
  qualityGateChangesSupported,
  qualityGatesSupported,
  startQualityGates,
  subscribeQualityGateChanges
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

  it('stops one gate by its id', async () => {
    await cancelQualityGates(local, 'repo::/work', 'lint')
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      local,
      'qualityGates.cancel',
      { worktree: 'id:repo::/work', gateId: 'lint' },
      expect.anything()
    )
  })

  describe('change stream', () => {
    type Handlers = {
      onEvent: (result: unknown) => void
      onError: (error: unknown) => void
      onClose: () => void
    }
    const unsubscribe = vi.fn()
    let stream: Handlers

    async function open(target: typeof local | typeof remote = remote) {
      const onChanged = vi.fn()
      const onLost = vi.fn()
      const handle = await subscribeQualityGateChanges(target, 'repo::/srv/app', {
        onChanged,
        onLost
      })
      return { onChanged, onLost, handle }
    }

    beforeEach(() => {
      unsubscribe.mockReset()
      subscribeRuntimeRpc.mockReset()
      subscribeRuntimeRpc.mockImplementation(async (_target, _method, _params, handlers) => {
        stream = handlers
        return { unsubscribe }
      })
    })

    it('asks a remote host for the stream capability apart from the gates themselves', async () => {
      runtimeEnvironmentSupportsCapability.mockResolvedValueOnce(false)

      expect(await qualityGateChangesSupported(remote)).toBe(false)
      expect(await qualityGateChangesSupported(local)).toBe(true)
      expect(runtimeEnvironmentSupportsCapability).toHaveBeenCalledTimes(1)
      expect(runtimeEnvironmentSupportsCapability).toHaveBeenCalledWith(
        'env-ssh',
        'quality-gates.subscribe.v1',
        expect.any(Number)
      )
    })

    it('asks for the slow watch only of a host that advertises it, and names it in the request', async () => {
      runtimeEnvironmentSupportsCapability.mockResolvedValueOnce(false)
      expect(await qualityGateBackgroundChangesSupported(remote)).toBe(false)
      expect(await qualityGateBackgroundChangesSupported(local)).toBe(true)
      expect(runtimeEnvironmentSupportsCapability).toHaveBeenCalledWith(
        'env-ssh',
        'quality-gates.subscribe-cadence.v1',
        expect.any(Number)
      )

      await subscribeQualityGateChanges(
        remote,
        'repo::/srv/app',
        { onChanged: vi.fn(), onLost: vi.fn() },
        { background: true }
      )
      expect(subscribeRuntimeRpc).toHaveBeenLastCalledWith(
        remote,
        'qualityGates.subscribe',
        { worktree: 'id:repo::/srv/app', cadence: 'background' },
        expect.anything()
      )
    })

    it('subscribes on the host that owns the worktree and reads again on every signal', async () => {
      const { onChanged, onLost } = await open()
      expect(subscribeRuntimeRpc).toHaveBeenCalledWith(
        remote,
        'qualityGates.subscribe',
        { worktree: 'id:repo::/srv/app' },
        expect.anything()
      )

      stream.onEvent({ type: 'ready', subscriptionId: 'sub-1' })
      stream.onEvent({ type: 'changed' })
      expect(onChanged).toHaveBeenCalledTimes(2)
      expect(onLost).not.toHaveBeenCalled()
    })

    it('ignores a frame a newer host may send instead of treating it as a change or a loss', async () => {
      const { onChanged, onLost } = await open()
      stream.onEvent({ type: 'progress', percent: 40 })
      stream.onEvent(null)
      expect(onChanged).not.toHaveBeenCalled()
      expect(onLost).not.toHaveBeenCalled()
    })

    it('reports an older host apart from a dropped stream, and reports the end once', async () => {
      const older = await open()
      stream.onError({ code: 'method_not_found', message: 'Unknown method' })
      stream.onClose()
      expect(older.onLost.mock.calls).toEqual([[true]])

      const dropped = await open()
      stream.onClose()
      expect(dropped.onLost.mock.calls).toEqual([[false]])

      const ended = await open()
      stream.onEvent({ type: 'end' })
      stream.onEvent({ type: 'changed' })
      expect(ended.onLost.mock.calls).toEqual([[false]])
      expect(ended.onChanged).not.toHaveBeenCalled()
    })

    it('tells a remote host which stream to end, and only closes the local one', async () => {
      const far = await open(remote)
      stream.onEvent({ type: 'ready', subscriptionId: 'sub-7' })
      far.handle.close()
      expect(unsubscribe).toHaveBeenCalledTimes(1)
      expect(callRuntimeRpc).toHaveBeenCalledWith(remote, 'qualityGates.unsubscribe', {
        subscriptionId: 'sub-7'
      })
      // Our own close is not a loss.
      stream.onClose()
      expect(far.onLost).not.toHaveBeenCalled()

      callRuntimeRpc.mockClear()
      const near = await open(local)
      stream.onEvent({ type: 'ready', subscriptionId: 'sub-8' })
      near.handle.close()
      expect(callRuntimeRpc).not.toHaveBeenCalled()
    })
  })
})
