import type { ClaudeModsNode, ClaudeModsPress } from '../claude-mods-tree'
import type { ClaudeModsClientFrame, ClaudeModsClientFrameDeath } from './claude-mods-client-frame'
import type { ClaudeModsClientEntry } from './claude-mods-client-bundle'
import type {
  ClaudeModsClientListeners,
  ClaudeModsClientSignal
} from './claude-mods-client-protocol'
import { readClaudeModsClientTree } from './claude-mods-client-tree'
import {
  readClaudeModsClientPost,
  type ClaudeModsClientKeyEvent,
  type ClaudeModsClientPointerEvent
} from './claude-mods-client-events'
import type {
  ClaudeModsClientPhase,
  ClaudeModsClientPressEvent,
  ClaudeModsClientRelay
} from './claude-mods-client-relay'
import { ClaudeModsClientGuard, ClaudeModsClientWork } from './claude-mods-client-work'

const RENDER_LOOP_REASON =
  'set its state again after each of 3 renders, nothing heard between; set state on a pointer or key event, a tick, a press or new props, and let a render settle'

export type ClaudeModsClientInstanceHandlers = {
  drawn: (tree: ClaudeModsNode, listeners: ClaudeModsClientListeners) => void
  listened: (listeners: ClaudeModsClientListeners) => void
  failed: (phase: ClaudeModsClientPhase, reason: string) => void
  /** A press answered for a drawing the site no longer holds: the site must be asked again. */
  stale: () => void
  /** A neighbour's call overran and took the frame down: mount again in a fresh one. */
  evicted: () => void
}

function deathPhase(death: ClaudeModsClientFrameDeath): ClaudeModsClientPhase {
  return death.op === 'render' ? 'render' : death.op === 'mount' ? 'load' : 'run'
}

/** One mount of a Client in its frame; a remount is a new instance under a new id. */
export class ClaudeModsClientInstance {
  private readonly work: ClaudeModsClientWork
  private readonly guard = new ClaudeModsClientGuard()
  private readonly stopListening: () => void
  private propsJson: string
  private handles: number[] = []
  private listening: ClaudeModsClientListeners = { key: false, pointer: false }
  private closed = false
  private faulted = false

  constructor(
    private readonly frame: ClaudeModsClientFrame,
    private readonly id: string,
    private readonly plugin: string,
    private readonly relay: ClaudeModsClientRelay,
    private readonly handlers: ClaudeModsClientInstanceHandlers
  ) {
    this.propsJson = ''
    const stopSignals = frame.listen(id, (signal) => this.onSignal(signal))
    const stopDeath = frame.onDeath((death) => this.onDeath(death), id)
    this.stopListening = () => {
      stopSignals()
      stopDeath()
    }
    this.work = new ClaudeModsClientWork(frame, id, {
      failed: (phase, reason) => {
        if (!frame.dead) {
          this.fail(phase, reason)
        }
      },
      rendered: (text, listeners) => this.draw(text, listeners),
      listened: (listeners) => this.listen(listeners)
    })
  }

  mount(entry: ClaudeModsClientEntry, props: unknown, columns: number, rows: number): void {
    this.propsJson = JSON.stringify(props ?? null)
    const { id } = this
    this.work.call({ op: 'mount', id, entry: entry.entry, component: entry.component, props })
    this.work.call({ op: 'resize', id, columns, rows })
    this.work.render()
  }

  /** `auto`: the size follows the module's own drawing, so it must settle within the guard. */
  resize(columns: number, rows: number, auto: boolean): void {
    if (auto && !this.guard.measured()) {
      return
    }
    if (!auto) {
      this.guard.prompted()
    }
    this.work.call({ op: 'resize', id: this.id, columns, rows })
    this.work.render()
  }

  /** New props from the site's redraw or a `ui_message` answer; equal props draw nothing. */
  setProps(props: unknown): void {
    const json = JSON.stringify(props ?? null)
    if (json === this.propsJson) {
      return
    }
    this.propsJson = json
    this.guard.prompted()
    this.work.call({ op: 'setProps', id: this.id, props })
    this.work.render()
  }

  get listeners(): ClaudeModsClientListeners {
    return this.listening
  }

  /** True when the module listened and the event went to it. */
  act(
    kind: 'key' | 'pointer',
    payload: ClaudeModsClientKeyEvent | ClaudeModsClientPointerEvent
  ): boolean {
    if (!this.listening[kind] || this.closed) {
      return false
    }
    this.guard.prompted()
    this.work.act(kind, payload)
    return true
  }

  async press(
    press: ClaudeModsPress,
    key: string | undefined,
    event: ClaudeModsClientPressEvent
  ): Promise<void> {
    if (press.plugin !== this.plugin || this.closed) {
      return
    }
    const outcome = await this.relay.press(key ?? '', event)
    if (this.closed) {
      return
    }
    if (outcome.kind === 'stale') {
      this.handlers.stale()
    } else if (outcome.kind === 'reached') {
      this.guard.prompted()
      this.work.act('held', { handle: press.handle, event: outcome.reached })
    }
  }

  /** Unmounts in the frame (timers stopped there) and forgets everything still in flight. */
  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.work.close()
    this.stopListening()
    this.relay.cancel()
    if (!this.frame.dead) {
      void this.frame.call({ op: 'unmount', id: this.id }).then((result) => this.unmounted(result))
    }
  }

  /** No listener is left to hear an unmount that overran, so it is reported from here. */
  private unmounted(result: { ok: boolean }): void {
    const death = this.frame.dead
    if (!result.ok && death?.op === 'unmount' && death.id === this.id && !this.faulted) {
      this.relay.fault('run', `unmounting ${death.reason}`)
    }
  }

  /** Only the instance whose call overran faults; a frame failing on its own faults them all. */
  private onDeath(death: ClaudeModsClientFrameDeath): void {
    if (death.id === undefined || death.id === this.id) {
      this.fail(deathPhase(death), death.reason)
    } else if (!this.closed) {
      this.close()
      this.handlers.evicted()
    }
  }

  private fail(phase: ClaudeModsClientPhase, reason: string): void {
    if (!this.closed) {
      this.faulted = true
      this.close()
      this.handlers.failed(phase, reason)
    }
  }

  private draw(text: string, listeners: ClaudeModsClientListeners | undefined): void {
    const drawn = readClaudeModsClientTree(text, this.plugin, this.frame.bundle.limits)
    if (!drawn.ok) {
      this.fail('render', drawn.reason)
      return
    }
    const retired = this.handles
    this.handles = drawn.handles
    if (retired.length > 0) {
      this.frame.note({ op: 'dropHeld', id: this.id, handles: retired })
    }
    if (listeners) {
      this.listening = listeners
    }
    this.handlers.drawn(drawn.tree, this.listening)
  }

  private listen(listeners: ClaudeModsClientListeners): void {
    const previous = this.listening
    this.listening = listeners
    if (previous.key !== listeners.key || previous.pointer !== listeners.pointer) {
      this.handlers.listened(listeners)
    }
  }

  private onSignal(signal: ClaudeModsClientSignal): void {
    if (this.closed) {
      return
    }
    switch (signal.type) {
      case 'schedule':
        if (this.guard.unprompted()) {
          this.work.render()
        } else {
          this.fail('run', RENDER_LOOP_REASON)
        }
        return
      case 'tick':
        this.guard.prompted()
        this.work.tick(signal.handle)
        return
      case 'post': {
        const post = readClaudeModsClientPost(signal.text)
        if (post.ok) {
          this.relay.post(post.data)
        } else {
          this.fail('run', post.reason)
        }
        return
      }
      case 'fault':
        this.fail('run', signal.reason)
    }
  }
}
