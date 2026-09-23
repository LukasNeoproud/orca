import { randomUUID } from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 120_000

export type AgentContextTerminalSurfaceMode = 'compacted' | 'fresh'

export type AgentContextTerminalSurfaceSource = {
  paneKey: string
  providerSessionId: string
  sourceGeneration: string
}

export type AgentContextTerminalSurfaceCandidate = {
  providerSessionId: string
  transcriptPath?: string
}

export type AgentContextTerminalSurfaceOffer = {
  requestId: string
  source: AgentContextTerminalSurfaceSource
  mode: AgentContextTerminalSurfaceMode
  candidate?: AgentContextTerminalSurfaceCandidate
}

export type AgentContextTerminalSurfacePending = AgentContextTerminalSurfaceOffer

export type AgentContextTerminalSurfaceClaim = {
  claimId: string
}

export type AgentContextTerminalSurfaceCompletion =
  | { status: 'completed' }
  | { status: 'failed'; error: string }

export type AgentContextTerminalSurfaceOfferEffects = {
  guard: () => boolean | Promise<boolean>
  markEffectPossible?: () => void | Promise<void>
}

type PendingOffer = {
  offer: AgentContextTerminalSurfaceOffer
  effects: AgentContextTerminalSurfaceOfferEffects
  claiming: boolean
  claimed: AgentContextTerminalSurfaceClaim | null
  timer: ReturnType<typeof setTimeout>
  resolve: () => void
  reject: (error: Error) => void
}

function surfaceError(code: string): Error {
  return new Error(code)
}

/**
 * Holds a host-authorized request until the renderer that owns its terminal pane
 * can safely perform the visual PTY transition. It never starts the replacement.
 */
export class AgentContextTerminalSurfaceBroker {
  private readonly pending = new Map<string, PendingOffer>()

  constructor(private readonly options: { timeoutMs?: number } = {}) {}

  offer(
    offer: AgentContextTerminalSurfaceOffer,
    effects: AgentContextTerminalSurfaceOfferEffects
  ): Promise<void> {
    if (this.pending.has(offer.requestId)) {
      return Promise.reject(surfaceError('agent_context_surface_request_conflict'))
    }
    if (!offer.requestId || !offer.source.paneKey || !offer.source.providerSessionId) {
      return Promise.reject(surfaceError('agent_context_surface_request_invalid'))
    }
    return new Promise<void>((resolve, reject) => {
      const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const entry: PendingOffer = {
        offer,
        effects,
        claiming: false,
        claimed: null,
        timer: setTimeout(() => {
          const current = this.pending.get(offer.requestId)
          if (current !== entry) {
            return
          }
          this.pending.delete(offer.requestId)
          reject(
            surfaceError(
              entry.claimed
                ? 'agent_context_surface_outcome_unknown'
                : 'agent_context_surface_unavailable'
            )
          )
        }, timeoutMs),
        resolve,
        reject
      }
      entry.timer.unref?.()
      this.pending.set(offer.requestId, entry)
    })
  }

  surface(
    source: Pick<AgentContextTerminalSurfaceSource, 'paneKey' | 'providerSessionId'>
  ): AgentContextTerminalSurfacePending | null {
    for (const entry of this.pending.values()) {
      if (
        !entry.claiming &&
        entry.claimed === null &&
        entry.offer.source.paneKey === source.paneKey &&
        entry.offer.source.providerSessionId === source.providerSessionId
      ) {
        return structuredClone(entry.offer)
      }
    }
    return null
  }

  async claimSurface(input: {
    requestId: string
    paneKey: string
    providerSessionId: string
  }): Promise<AgentContextTerminalSurfaceClaim> {
    const entry = this.pending.get(input.requestId)
    if (
      !entry ||
      entry.claiming ||
      entry.claimed !== null ||
      entry.offer.source.paneKey !== input.paneKey ||
      entry.offer.source.providerSessionId !== input.providerSessionId
    ) {
      throw surfaceError('agent_context_surface_unavailable')
    }
    entry.claiming = true
    let current: boolean
    try {
      current = await entry.effects.guard()
    } catch (error) {
      this.reject(
        entry,
        error instanceof Error ? error : surfaceError('agent_context_surface_guard_failed')
      )
      throw error
    }
    if (!current) {
      this.reject(entry, surfaceError('agent_context_surface_stale'))
      throw surfaceError('agent_context_surface_stale')
    }
    if (this.pending.get(input.requestId) !== entry) {
      throw surfaceError('agent_context_surface_unavailable')
    }
    entry.claimed = { claimId: randomUUID() }
    try {
      await entry.effects.markEffectPossible?.()
    } catch (error) {
      this.reject(
        entry,
        error instanceof Error ? error : surfaceError('agent_context_surface_effect_mark_failed')
      )
      throw error
    }
    if (this.pending.get(input.requestId) !== entry) {
      throw surfaceError('agent_context_surface_outcome_unknown')
    }
    return { ...entry.claimed }
  }

  completeSurface(
    input: { requestId: string; claimId: string },
    completion: AgentContextTerminalSurfaceCompletion
  ): void {
    const entry = this.pending.get(input.requestId)
    if (!entry || entry.claimed?.claimId !== input.claimId) {
      throw surfaceError('agent_context_surface_claim_invalid')
    }
    if (completion.status === 'completed') {
      this.resolve(entry)
      return
    }
    this.reject(entry, surfaceError(completion.error || 'agent_context_surface_failed'))
  }

  cancel(requestId: string, error = 'agent_context_surface_cancelled'): void {
    const entry = this.pending.get(requestId)
    if (entry) {
      this.reject(entry, surfaceError(error))
    }
  }

  dispose(): void {
    for (const entry of this.pending.values()) {
      this.reject(entry, surfaceError('agent_context_surface_disposed'))
    }
  }

  private resolve(entry: PendingOffer): void {
    clearTimeout(entry.timer)
    this.pending.delete(entry.offer.requestId)
    entry.resolve()
  }

  private reject(entry: PendingOffer, error: Error): void {
    clearTimeout(entry.timer)
    this.pending.delete(entry.offer.requestId)
    entry.reject(error)
  }
}
