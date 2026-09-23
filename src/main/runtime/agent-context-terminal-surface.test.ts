import { describe, expect, it, vi } from 'vitest'
import { AgentContextTerminalSurfaceBroker } from './agent-context-terminal-surface'

const source = {
  paneKey: 'tab:leaf',
  providerSessionId: 'thread-1',
  sourceGeneration: 'generation-1'
}

const offer = (requestId = 'request-1') => ({ requestId, source, mode: 'compacted' as const })

describe('AgentContextTerminalSurfaceBroker', () => {
  it('exposes only an unclaimed matching offer and claims it once after the host guard', async () => {
    const broker = new AgentContextTerminalSurfaceBroker()
    const guard = vi.fn(async () => true)
    const markEffectPossible = vi.fn()
    const waiting = broker.offer(offer(), { guard, markEffectPossible })

    expect(broker.surface(source)).toEqual(offer())
    expect(broker.surface({ ...source, paneKey: 'other:leaf' })).toBeNull()
    const claim = await broker.claimSurface({
      requestId: 'request-1',
      paneKey: source.paneKey,
      providerSessionId: source.providerSessionId
    })

    expect(guard).toHaveBeenCalledOnce()
    expect(markEffectPossible).toHaveBeenCalledOnce()
    expect(broker.surface(source)).toBeNull()
    await expect(
      broker.claimSurface({
        requestId: 'request-1',
        paneKey: source.paneKey,
        providerSessionId: source.providerSessionId
      })
    ).rejects.toThrow('agent_context_surface_unavailable')

    broker.completeSurface(
      { requestId: 'request-1', claimId: claim.claimId },
      { status: 'completed' }
    )
    await expect(waiting).resolves.toBeUndefined()
  })

  it('rejects a stale request before it can cause a renderer effect', async () => {
    const broker = new AgentContextTerminalSurfaceBroker()
    const markEffectPossible = vi.fn()
    const waiting = broker.offer(offer(), { guard: () => false, markEffectPossible })

    await expect(
      broker.claimSurface({
        requestId: 'request-1',
        paneKey: source.paneKey,
        providerSessionId: source.providerSessionId
      })
    ).rejects.toThrow('agent_context_surface_stale')
    expect(markEffectPossible).not.toHaveBeenCalled()
    await expect(waiting).rejects.toThrow('agent_context_surface_stale')
  })

  it('reserves the one global claim before an asynchronous guard settles', async () => {
    let allowGuard!: () => void
    const guard = new Promise<void>((resolve) => {
      allowGuard = resolve
    })
    const broker = new AgentContextTerminalSurfaceBroker()
    const waiting = broker.offer(offer(), { guard: async () => (await guard, true) })
    const first = broker.claimSurface({
      requestId: 'request-1',
      paneKey: source.paneKey,
      providerSessionId: source.providerSessionId
    })

    await expect(
      broker.claimSurface({
        requestId: 'request-1',
        paneKey: source.paneKey,
        providerSessionId: source.providerSessionId
      })
    ).rejects.toThrow('agent_context_surface_unavailable')
    allowGuard()
    const claim = await first
    broker.completeSurface(
      { requestId: 'request-1', claimId: claim.claimId },
      { status: 'completed' }
    )
    await expect(waiting).resolves.toBeUndefined()
  })

  it('distinguishes a missing surface from an unconfirmed claimed effect at timeout', async () => {
    vi.useFakeTimers()
    try {
      const unclaimed = new AgentContextTerminalSurfaceBroker({ timeoutMs: 10 })
      const unavailable = unclaimed.offer(offer(), { guard: () => true })
      void unavailable.catch(() => undefined)
      await vi.advanceTimersByTimeAsync(10)
      await expect(unavailable).rejects.toThrow('agent_context_surface_unavailable')

      const claimed = new AgentContextTerminalSurfaceBroker({ timeoutMs: 10 })
      const unknown = claimed.offer(offer(), { guard: () => true })
      void unknown.catch(() => undefined)
      await claimed.claimSurface({
        requestId: 'request-1',
        paneKey: source.paneKey,
        providerSessionId: source.providerSessionId
      })
      await vi.advanceTimersByTimeAsync(10)
      await expect(unknown).rejects.toThrow('agent_context_surface_outcome_unknown')
    } finally {
      vi.useRealTimers()
    }
  })
})
