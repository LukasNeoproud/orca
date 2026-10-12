import {
  OrcaInteractionRequestSchema,
  parseOrcaInteractionResult,
  type OrcaInteractionResult
} from '../../shared/orca-interaction'
import {
  TERMINAL_INTERACTION_WAIT_MAX_MS,
  type TerminalInteractionCaller,
  type TerminalInteractionPendingRequest,
  type TerminalInteractionRequestParams,
  type TerminalInteractionStatus
} from '../../shared/terminal-interaction'
import {
  completeTerminalInteractionEntry,
  sameTerminalInteractionBinding,
  sameTerminalInteractionCaller,
  TERMINAL_INTERACTION_REGISTRY_DEFAULTS,
  terminalInteractionCompletedStatus,
  waitForTerminalInteractionCompletion,
  type TerminalInteractionBinding,
  type TerminalInteractionCompletedEntry,
  type TerminalInteractionEntryBase,
  type TerminalInteractionPendingEntry,
  type TerminalInteractionRegistryOptions
} from './terminal-interaction-registry-state'

export type { TerminalInteractionBinding, TerminalInteractionRegistryOptions }

export class TerminalInteractionRegistry {
  private readonly pendingEntries = new Map<string, TerminalInteractionPendingEntry>()
  private readonly completedEntries = new Map<string, TerminalInteractionCompletedEntry>()
  private readonly options: typeof TERMINAL_INTERACTION_REGISTRY_DEFAULTS & { now: () => number }

  constructor(options: TerminalInteractionRegistryOptions = {}) {
    this.options = {
      ...TERMINAL_INTERACTION_REGISTRY_DEFAULTS,
      ...options,
      now: options.now ?? Date.now
    }
  }

  request(
    input: TerminalInteractionRequestParams,
    binding: TerminalInteractionBinding
  ): TerminalInteractionStatus {
    this.pruneCompleted()
    const request = OrcaInteractionRequestSchema.parse(input.request)
    const fingerprint = JSON.stringify({ caller: input.caller, request })
    const pending = this.pendingEntries.get(input.requestId)
    if (pending) {
      this.assertReplay(pending, fingerprint, binding)
      this.renewLease(pending)
      return { requestId: input.requestId, status: 'pending' }
    }
    const completed = this.completedEntries.get(input.requestId)
    if (completed) {
      this.assertReplay(completed, fingerprint, binding)
      return terminalInteractionCompletedStatus(completed)
    }
    if (this.pendingEntries.size >= this.options.maxPending) {
      throw new Error('terminal_interaction_capacity_reached')
    }
    const createdAt = this.options.now()
    const entry: TerminalInteractionPendingEntry = {
      requestId: input.requestId,
      caller: structuredClone(input.caller),
      binding: { ...binding },
      request: structuredClone(request),
      fingerprint,
      createdAt,
      leaseExpiresAt: createdAt + this.options.callerLeaseMs,
      leaseTimer: null,
      waiters: new Set()
    }
    this.pendingEntries.set(entry.requestId, entry)
    this.scheduleLeaseExpiry(entry)
    return { requestId: entry.requestId, status: 'pending' }
  }

  async wait(
    caller: TerminalInteractionCaller,
    requestId: string,
    binding: TerminalInteractionBinding,
    options: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<TerminalInteractionStatus> {
    this.pruneCompleted()
    const completed = this.completedEntries.get(requestId)
    if (completed) {
      this.assertOwner(completed, caller, binding)
      return terminalInteractionCompletedStatus(completed)
    }
    const entry = this.requirePending(requestId)
    this.assertOwner(entry, caller, binding)
    this.renewLease(entry)
    const timeoutMs = Math.max(0, Math.min(options.timeoutMs, TERMINAL_INTERACTION_WAIT_MAX_MS))
    if (timeoutMs === 0 || options.signal?.aborted) {
      return { requestId, status: 'pending' }
    }
    return waitForTerminalInteractionCompletion(entry, timeoutMs, options.signal)
  }

  cancel(
    caller: TerminalInteractionCaller,
    requestId: string,
    binding: TerminalInteractionBinding
  ): TerminalInteractionStatus {
    this.pruneCompleted()
    const completed = this.completedEntries.get(requestId)
    if (completed) {
      this.assertOwner(completed, caller, binding)
      return terminalInteractionCompletedStatus(completed)
    }
    const entry = this.requirePending(requestId)
    this.assertOwner(entry, caller, binding)
    return this.complete(entry, { status: 'cancelled' })
  }

  respond(
    requestId: string,
    value: unknown,
    binding?: TerminalInteractionBinding
  ): { accepted: true } {
    this.pruneCompleted()
    const completed = this.completedEntries.get(requestId)
    if (completed) {
      const result = parseOrcaInteractionResult(completed.request, value)
      if (!result) {
        throw new Error('terminal_interaction_result_invalid')
      }
      if (JSON.stringify(result) !== JSON.stringify(completed.result)) {
        throw new Error('terminal_interaction_response_conflict')
      }
      return { accepted: true }
    }
    const entry = this.requirePending(requestId)
    if (!binding || !sameTerminalInteractionBinding(entry.binding, binding)) {
      this.complete(entry, { status: 'cancelled' })
      throw new Error('terminal_interaction_caller_stale')
    }
    const result = parseOrcaInteractionResult(entry.request, value)
    if (!result) {
      throw new Error('terminal_interaction_result_invalid')
    }
    this.complete(entry, result)
    return { accepted: true }
  }

  pending(): TerminalInteractionPendingRequest[] {
    this.expireDueLeases()
    return [...this.pendingEntries.values()].map((entry) => ({
      requestId: entry.requestId,
      terminalHandle: entry.caller.terminalHandle,
      paneKey: entry.caller.paneKey,
      ...(entry.binding.terminalTitle ? { terminalTitle: entry.binding.terminalTitle } : {}),
      request: structuredClone(entry.request),
      createdAt: entry.createdAt
    }))
  }

  getPendingBinding(requestId: string): TerminalInteractionBinding | null {
    this.expireDueLeases()
    const entry = this.pendingEntries.get(requestId)
    return entry ? { ...entry.binding } : null
  }

  invalidate(requestId: string): void {
    const entry = this.pendingEntries.get(requestId)
    if (entry) {
      this.complete(entry, { status: 'cancelled' })
    }
  }

  private assertReplay(
    entry: TerminalInteractionEntryBase,
    fingerprint: string,
    binding: TerminalInteractionBinding
  ): void {
    if (entry.fingerprint !== fingerprint) {
      throw new Error('terminal_interaction_request_conflict')
    }
    if (!sameTerminalInteractionBinding(entry.binding, binding)) {
      const pending = this.pendingEntries.get(entry.requestId)
      if (pending) {
        this.complete(pending, { status: 'cancelled' })
      }
      throw new Error('terminal_interaction_caller_stale')
    }
  }

  private assertOwner(
    entry: TerminalInteractionEntryBase,
    caller: TerminalInteractionCaller,
    binding: TerminalInteractionBinding
  ): void {
    if (!sameTerminalInteractionCaller(entry.caller, caller)) {
      throw new Error('terminal_interaction_caller_mismatch')
    }
    if (!sameTerminalInteractionBinding(entry.binding, binding)) {
      const pending = this.pendingEntries.get(entry.requestId)
      if (pending) {
        this.complete(pending, { status: 'cancelled' })
      }
      throw new Error('terminal_interaction_caller_stale')
    }
  }

  private requirePending(requestId: string): TerminalInteractionPendingEntry {
    this.expireDueLeases()
    const entry = this.pendingEntries.get(requestId)
    if (!entry) {
      throw new Error('terminal_interaction_request_not_found')
    }
    return entry
  }

  private renewLease(entry: TerminalInteractionPendingEntry): void {
    entry.leaseExpiresAt = this.options.now() + this.options.callerLeaseMs
    this.scheduleLeaseExpiry(entry)
  }

  private scheduleLeaseExpiry(entry: TerminalInteractionPendingEntry): void {
    if (entry.leaseTimer) {
      clearTimeout(entry.leaseTimer)
    }
    entry.leaseTimer = setTimeout(
      () => {
        if (this.pendingEntries.get(entry.requestId) !== entry) {
          return
        }
        if (entry.leaseExpiresAt > this.options.now()) {
          this.scheduleLeaseExpiry(entry)
          return
        }
        this.complete(entry, { status: 'cancelled' })
      },
      Math.max(0, entry.leaseExpiresAt - this.options.now())
    )
    entry.leaseTimer.unref?.()
  }

  private expireDueLeases(): void {
    const now = this.options.now()
    for (const entry of this.pendingEntries.values()) {
      if (entry.leaseExpiresAt <= now) {
        this.complete(entry, { status: 'cancelled' })
      }
    }
    this.pruneCompleted(now)
  }

  private complete(
    entry: TerminalInteractionPendingEntry,
    result: OrcaInteractionResult
  ): TerminalInteractionStatus {
    if (entry.leaseTimer) {
      clearTimeout(entry.leaseTimer)
    }
    this.pendingEntries.delete(entry.requestId)
    const completed = completeTerminalInteractionEntry(entry, result, this.options.now())
    this.completedEntries.set(entry.requestId, completed)
    const status = terminalInteractionCompletedStatus(completed)
    for (const waiter of entry.waiters) {
      waiter(status)
    }
    this.pruneCompleted()
    return status
  }

  private pruneCompleted(now = this.options.now()): void {
    for (const [requestId, entry] of this.completedEntries) {
      if (now - entry.completedAt >= this.options.completedRetentionMs) {
        this.completedEntries.delete(requestId)
      }
    }
    while (this.completedEntries.size > this.options.maxCompleted) {
      const oldest = this.completedEntries.keys().next().value as string | undefined
      if (!oldest) {
        return
      }
      this.completedEntries.delete(oldest)
    }
  }
}

const registries = new WeakMap<WeakKey, TerminalInteractionRegistry>()

export function getTerminalInteractionRegistry(runtime: WeakKey): TerminalInteractionRegistry {
  const existing = registries.get(runtime)
  if (existing) {
    return existing
  }
  const registry = new TerminalInteractionRegistry()
  registries.set(runtime, registry)
  return registry
}
