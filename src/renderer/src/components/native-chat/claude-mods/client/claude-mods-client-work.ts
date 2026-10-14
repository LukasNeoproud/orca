import type { ClaudeModsClientFrame } from './claude-mods-client-frame'
import type {
  ClaudeModsClientActKind,
  ClaudeModsClientCall,
  ClaudeModsClientListeners
} from './claude-mods-client-protocol'
import type { ClaudeModsClientPhase } from './claude-mods-client-relay'

type Item =
  | { kind: 'call'; call: ClaudeModsClientCall }
  | { kind: 'render' }
  | { kind: 'act'; act: ClaudeModsClientActKind; payload: unknown; coalesce?: string }

export type ClaudeModsClientWorkHandlers = {
  failed: (phase: ClaudeModsClientPhase, reason: string) => void
  rendered: (text: string, listeners: ClaudeModsClientListeners | undefined) => void
  listened?: (listeners: ClaudeModsClientListeners) => void
}

function phaseOf(item: Item): ClaudeModsClientPhase {
  if (item.kind === 'render') {
    return 'render'
  }
  return item.kind === 'call' && item.call.op === 'mount' ? 'load' : 'run'
}

/**
 * One instance's calls into its frame, one at a time and in order. A render already waiting
 * absorbs another, a tick waiting for the same timer absorbs the next, and a pointer move
 * waiting absorbs a later move, so a slow module is never flooded.
 */
export class ClaudeModsClientWork {
  private readonly queue: Item[] = []
  private running = false
  private closed = false

  constructor(
    private readonly frame: ClaudeModsClientFrame,
    private readonly id: string,
    private readonly handlers: ClaudeModsClientWorkHandlers
  ) {}

  call(call: ClaudeModsClientCall): void {
    this.push({ kind: 'call', call })
  }

  render(): void {
    if (!this.queue.some((item) => item.kind === 'render')) {
      this.push({ kind: 'render' })
    }
  }

  tick(handle: number): void {
    this.coalesced('tick', handle, `tick:${handle}`)
  }

  act(kind: 'key' | 'pointer' | 'held', payload: unknown): void {
    const isMove =
      kind === 'pointer' &&
      typeof payload === 'object' &&
      payload !== null &&
      'type' in payload &&
      payload.type === 'move'
    this.coalesced(kind, payload, isMove ? 'move' : undefined)
  }

  close(): void {
    this.closed = true
    this.queue.length = 0
  }

  private coalesced(act: ClaudeModsClientActKind, payload: unknown, coalesce?: string): void {
    const waiting = coalesce
      ? this.queue.find((item) => item.kind === 'act' && item.coalesce === coalesce)
      : undefined
    if (waiting?.kind === 'act') {
      waiting.payload = payload
      return
    }
    this.push({ kind: 'act', act, payload, ...(coalesce ? { coalesce } : {}) })
  }

  private push(item: Item): void {
    if (this.closed) {
      return
    }
    this.queue.push(item)
    if (!this.running) {
      void this.drain()
    }
  }

  private async drain(): Promise<void> {
    this.running = true
    while (!this.closed) {
      const item = this.queue.shift()
      if (!item) {
        break
      }
      const call: ClaudeModsClientCall =
        item.kind === 'call'
          ? item.call
          : item.kind === 'render'
            ? { op: 'render', id: this.id }
            : { op: 'act', id: this.id, kind: item.act, payload: item.payload }
      const result = await this.frame.call(call)
      if (this.closed) {
        break
      }
      if (!result.ok) {
        this.close()
        this.handlers.failed(phaseOf(item), result.reason)
        break
      }
      if (item.kind === 'render') {
        this.handlers.rendered(result.value ?? '', result.listeners)
      } else if (result.listeners) {
        this.handlers.listened?.(result.listeners)
      }
    }
    this.running = false
  }
}

/** Three renders in a row set state with nothing heard between: a render loop. */
const MAX_UNPROMPTED_RENDERS = 3
/** An auto-sized region changing on each of this many measurings in a row draws as it was. */
const MAX_MEASURINGS = 8

/** The render-loop and measure-loop counters, reset by anything the module heard. */
export class ClaudeModsClientGuard {
  private renders = 0
  private measurings = 0
  private warned = false

  /** A scheduled render the module asked for itself; false once that is a loop. */
  unprompted(): boolean {
    this.renders += 1
    return this.renders < MAX_UNPROMPTED_RENDERS
  }

  /** A size change the module's own drawing caused; false once it no longer settles. */
  measured(): boolean {
    this.measurings += 1
    if (this.measurings <= MAX_MEASURINGS) {
      return true
    }
    if (!this.warned) {
      this.warned = true
      console.warn(
        '[claude-mods] a Client region changed size on each of 8 measurings; give the Client a width and a height, or draw no more than surface.columns and surface.rows'
      )
    }
    return false
  }

  prompted(): void {
    this.renders = 0
    this.measurings = 0
  }

  reset(): void {
    this.prompted()
    this.warned = false
  }
}
