import type { ClaudeModsClientBundle } from './claude-mods-client-bundle'
import {
  readClaudeModsClientWorkerMessage,
  type ClaudeModsClientCall,
  type ClaudeModsClientListeners,
  type ClaudeModsClientNote,
  type ClaudeModsClientSignal
} from './claude-mods-client-protocol'
import { claudeModsClientWorkerUrl } from './claude-mods-client-worker-source'

/** What Claude Code gives a call into a module before it counts as a runaway. */
export const CLAUDE_MODS_CLIENT_CALL_BUDGET_MS = 1000
/** Loading and a mount also evaluate the modules' top level, which the budget does not cover. */
export const CLAUDE_MODS_CLIENT_LOAD_BUDGET_MS = 5000

/** The part of a Worker the frame uses, so tests can drive a fake one. */
export type ClaudeModsClientWorkerLike = {
  postMessage: (message: unknown) => void
  terminate: () => void
}

export type ClaudeModsClientWorkerFactory = (handlers: {
  onMessage: (data: unknown) => void
  onError: () => void
}) => ClaudeModsClientWorkerLike

export const createClaudeModsClientWorker: ClaudeModsClientWorkerFactory = (handlers) => {
  const worker = new Worker(claudeModsClientWorkerUrl(), {
    type: 'module',
    name: 'claude-mods-client'
  })
  worker.onmessage = (event) => handlers.onMessage(event.data)
  worker.onerror = () => handlers.onError()
  worker.onmessageerror = () => handlers.onError()
  return worker
}

export type ClaudeModsClientCallResult =
  | { ok: true; value?: string; listeners?: ClaudeModsClientListeners }
  | { ok: false; reason: string }

/** Why a frame stopped: the call that overran, or the worker itself failing. */
export type ClaudeModsClientFrameDeath = { id?: string; op: string; reason: string }

type Pending = {
  resolve: (result: ClaudeModsClientCallResult) => void
  timer: ReturnType<typeof setTimeout>
  id?: string
  op: string
}

/**
 * One plugin's surface modules at one hash, in a dedicated worker. Calls answer within their
 * budget or the worker is terminated, every pending call fails and every instance hears so.
 */
export class ClaudeModsClientFrame {
  private worker: ClaudeModsClientWorkerLike | null
  private seq = 0
  private readonly pending = new Map<number, Pending>()
  private readonly signals = new Map<string, (signal: ClaudeModsClientSignal) => void>()
  private readonly deathListeners = new Set<(death: ClaudeModsClientFrameDeath) => void>()
  private deathCause: ClaudeModsClientFrameDeath | null = null
  readonly ready: Promise<ClaudeModsClientCallResult>

  constructor(
    readonly bundle: ClaudeModsClientBundle,
    createWorker: ClaudeModsClientWorkerFactory = createClaudeModsClientWorker
  ) {
    let worker: ClaudeModsClientWorkerLike | null = null
    try {
      worker = createWorker({
        onMessage: (data) => this.onMessage(data),
        onError: () => this.die({ op: 'load', reason: 'its frame failed to run' })
      })
    } catch (error) {
      this.deathCause = { op: 'load', reason: `its frame did not start: ${String(error)}` }
    }
    this.worker = worker
    const { plugin, files, runtime, limits } = bundle
    this.ready = this.call({ op: 'load', plugin, files, runtime, limits })
  }

  get dead(): ClaudeModsClientFrameDeath | null {
    return this.deathCause
  }

  call(call: ClaudeModsClientCall): Promise<ClaudeModsClientCallResult> {
    const worker = this.worker
    if (!worker || this.deathCause) {
      return Promise.resolve({ ok: false, reason: this.deathCause?.reason ?? 'its frame stopped' })
    }
    const seq = ++this.seq
    const id = 'id' in call ? call.id : undefined
    const budget =
      call.op === 'load' || call.op === 'mount'
        ? CLAUDE_MODS_CLIENT_LOAD_BUDGET_MS
        : CLAUDE_MODS_CLIENT_CALL_BUDGET_MS
    return new Promise((resolve) => {
      const timer = setTimeout(
        () =>
          this.die({
            ...(id ? { id } : {}),
            op: call.op,
            reason: `ran longer than its ${budget}ms budget`
          }),
        budget
      )
      this.pending.set(seq, { resolve, timer, op: call.op, ...(id ? { id } : {}) })
      worker.postMessage({ ...call, seq })
    })
  }

  note(note: ClaudeModsClientNote): void {
    if (!this.deathCause) {
      this.worker?.postMessage(note)
    }
  }

  /** Routes the runtime's `host` signals for one instance id; the returned function stops it. */
  listen(id: string, onSignal: (signal: ClaudeModsClientSignal) => void): () => void {
    this.signals.set(id, onSignal)
    return () => {
      if (this.signals.get(id) === onSignal) {
        this.signals.delete(id)
      }
    }
  }

  onDeath(listener: (death: ClaudeModsClientFrameDeath) => void): () => void {
    this.deathListeners.add(listener)
    return () => this.deathListeners.delete(listener)
  }

  /** Ends the worker without blaming anyone: the frame was replaced or nobody draws it. */
  dispose(): void {
    this.stop({ op: 'dispose', reason: 'its frame was replaced' })
    this.deathListeners.clear()
  }

  private onMessage(data: unknown): void {
    const message = readClaudeModsClientWorkerMessage(data)
    if (!message) {
      return
    }
    if (message.type === 'answer') {
      const pending = this.pending.get(message.seq)
      if (!pending) {
        return
      }
      this.pending.delete(message.seq)
      clearTimeout(pending.timer)
      pending.resolve(
        message.ok
          ? {
              ok: true,
              ...(message.value !== undefined ? { value: message.value } : {}),
              ...(message.listeners ? { listeners: message.listeners } : {})
            }
          : { ok: false, reason: message.reason }
      )
      return
    }
    this.signals.get(message.id)?.(message)
  }

  private die(death: ClaudeModsClientFrameDeath): void {
    if (this.deathCause) {
      return
    }
    this.stop(death)
    for (const listener of this.deathListeners) {
      listener(death)
    }
  }

  private stop(death: ClaudeModsClientFrameDeath): void {
    this.deathCause ??= death
    this.worker?.terminate()
    this.worker = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, reason: death.reason })
    }
    this.pending.clear()
    this.signals.clear()
  }
}
