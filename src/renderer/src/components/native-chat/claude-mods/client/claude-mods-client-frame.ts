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
/** Calls wait and the worker began none nor said anything this long: it is stuck between calls. */
export const CLAUDE_MODS_CLIENT_STALL_MS = 5000
/** A renderer stall fires a budget late, maybe ahead of an answer already queued: wait once more. */
const LATE_GRACE_MS = 250

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
  budget: number
  /** Armed when the worker begins the call, so time spent queued behind others never counts. */
  timer: ReturnType<typeof setTimeout> | null
  postedAt: number
  begunAt: number | null
  graced: boolean
  id?: string
  op: string
}

/**
 * One plugin's surface modules at one hash, in a dedicated worker. A call answers within its
 * budget of running time or the worker is terminated, every pending call fails and every instance
 * hears so, the one whose call overran first.
 */
export class ClaudeModsClientFrame {
  private worker: ClaudeModsClientWorkerLike | null
  private seq = 0
  private readonly pending = new Map<number, Pending>()
  private readonly signals = new Map<string, (signal: ClaudeModsClientSignal) => void>()
  private readonly deathListeners = new Map<
    (death: ClaudeModsClientFrameDeath) => void,
    string | undefined
  >()
  private stall: ReturnType<typeof setTimeout> | null = null
  private lastHeard = 0
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
      this.pending.set(seq, {
        resolve,
        budget,
        timer: null,
        postedAt: Date.now(),
        begunAt: null,
        graced: false,
        op: call.op,
        ...(id ? { id } : {})
      })
      worker.postMessage({ ...call, seq })
      this.stall ??= setTimeout(() => this.stalled(), CLAUDE_MODS_CLIENT_STALL_MS)
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

  /** `id`: the instance listening, told first when its own call is the one that overran. */
  onDeath(listener: (death: ClaudeModsClientFrameDeath) => void, id?: string): () => void {
    this.deathListeners.set(listener, id)
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
    this.lastHeard = Date.now()
    if (message.type === 'begin') {
      this.begin(message.seq)
      return
    }
    if (message.type === 'answer') {
      const pending = this.pending.get(message.seq)
      if (!pending) {
        return
      }
      this.pending.delete(message.seq)
      if (pending.timer) {
        clearTimeout(pending.timer)
      }
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

  private begin(seq: number): void {
    const pending = this.pending.get(seq)
    if (!pending || pending.begunAt !== null) {
      return
    }
    pending.begunAt = Date.now()
    pending.timer = setTimeout(() => this.overran(seq), pending.budget)
  }

  private overran(seq: number): void {
    const pending = this.pending.get(seq)
    if (!pending) {
      return
    }
    const late = Date.now() - (pending.begunAt ?? 0) - pending.budget
    if (late > LATE_GRACE_MS && !pending.graced) {
      pending.graced = true
      pending.timer = setTimeout(() => this.overran(seq), LATE_GRACE_MS)
      return
    }
    this.die({
      ...(pending.id ? { id: pending.id } : {}),
      op: pending.op,
      reason: `ran longer than its ${pending.budget}ms budget`
    })
  }

  /** Calls wait, none begun, and the worker said nothing since the oldest was posted. */
  private stalled(): void {
    this.stall = null
    const waiting = [...this.pending.values()]
    if (waiting.length === 0 || this.deathCause) {
      return
    }
    // A call it began is bounded by its own budget.
    const begun = waiting.some((pending) => pending.begunAt !== null)
    const oldest = Math.min(...waiting.map((pending) => pending.postedAt))
    const quiet = Date.now() - Math.max(this.lastHeard, oldest)
    if (!begun && quiet >= CLAUDE_MODS_CLIENT_STALL_MS) {
      this.die({ op: 'run', reason: 'its frame stopped answering' })
      return
    }
    const wait = begun ? CLAUDE_MODS_CLIENT_STALL_MS : CLAUDE_MODS_CLIENT_STALL_MS - quiet
    this.stall = setTimeout(() => this.stalled(), wait)
  }

  private die(death: ClaudeModsClientFrameDeath): void {
    if (this.deathCause) {
      return
    }
    this.stop(death)
    const listeners = [...this.deathListeners]
    const culprit = listeners.filter(([, id]) => id !== undefined && id === death.id)
    for (const [listener] of [
      ...culprit,
      ...listeners.filter((entry) => !culprit.includes(entry))
    ]) {
      // One told earlier may have remounted and left this frame meanwhile.
      if (this.deathListeners.has(listener)) {
        listener(death)
      }
    }
  }

  private stop(death: ClaudeModsClientFrameDeath): void {
    this.deathCause ??= death
    this.worker?.terminate()
    this.worker = null
    if (this.stall) {
      clearTimeout(this.stall)
      this.stall = null
    }
    for (const pending of this.pending.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer)
      }
      pending.resolve({ ok: false, reason: death.reason })
    }
    this.pending.clear()
    this.signals.clear()
  }
}
