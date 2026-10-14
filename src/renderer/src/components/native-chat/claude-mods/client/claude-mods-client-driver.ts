import type { ClaudeModsNode } from '../claude-mods-tree'
import type { ClaudeModsDispatch } from '../claude-mods-draw-scope'
import type { ClaudeModsClientFrame } from './claude-mods-client-frame'
import type { ClaudeModsClientFrames, ClaudeModsClientLease } from './claude-mods-client-frames'
import type { ClaudeModsClientListeners } from './claude-mods-client-protocol'
import type {
  ClaudeModsClientKeyEvent,
  ClaudeModsClientPointerEvent
} from './claude-mods-client-events'
import {
  ClaudeModsClientRelay,
  type ClaudeModsClientAddress,
  type ClaudeModsClientPhase,
  type ClaudeModsClientRequest
} from './claude-mods-client-relay'
import { ClaudeModsClientInstance } from './claude-mods-client-instance'

export type ClaudeModsClientView =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'drawn'; tree: ClaudeModsNode; listeners: ClaudeModsClientListeners }
  | { kind: 'fault'; line: string }

/** What the region knows of its Client on each draw. */
export type ClaudeModsClientSpec = {
  address: ClaudeModsClientAddress
  /** The hash the site's drawing announced; undefined when the drawing does not say. */
  hash: string | undefined
  /** False when the drawing names its surface modules and this plugin is not among them. */
  loaded: boolean
  props: unknown
}

/** The region's size in cells; an auto side is measured from what the module drew. */
export type ClaudeModsClientSize = { columns: number; rows: number; auto: boolean }

let serial = 0

/**
 * One Client in one region: mounts it in its plugin's frame, sizes and draws it, routes the
 * person's presses, keys and pointer to it, and turns any failure into a fault line that is
 * retried only when the props or the site-given size change.
 */
export class ClaudeModsClientDriver {
  private view: ClaudeModsClientView = { kind: 'loading' }
  private readonly viewListeners = new Set<() => void>()
  private readonly serial = ++serial
  private generation = 0
  private spec: ClaudeModsClientSpec | null = null
  private specJson = ''
  private size: ClaudeModsClientSize | null = null
  private lease: ClaudeModsClientLease | null = null
  private instance: ClaudeModsClientInstance | null = null
  private relay: ClaudeModsClientRelay | null = null
  private thrownAt: string | null = null
  private readonly stopFrames: () => void
  private disposed = false

  /** Where the drawing's Buttons, Inputs and Selects go: into this Client, not the site. */
  readonly dispatch: ClaudeModsDispatch = {
    press: (press, key) => void this.instance?.press(press, key, { type: 'press' }),
    input: async (press, key, kind, value) =>
      this.instance?.press(press, key, { type: 'input', kind, value }),
    select: (press, key, value) => void this.instance?.press(press, key, { type: 'select', value })
  }

  constructor(
    private readonly frames: ClaudeModsClientFrames,
    private readonly request: ClaudeModsClientRequest,
    private readonly redrawSite: (instanceId: string) => void
  ) {
    this.stopFrames = frames.subscribe((plugin) => {
      if (plugin === this.spec?.address.plugin && this.lease?.stale && this.view.kind !== 'fault') {
        this.mount()
      }
    })
  }

  getView = (): ClaudeModsClientView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.viewListeners.add(listener)
    return () => this.viewListeners.delete(listener)
  }

  /** The Client as the site drew it; mounts, remounts or hands new props as they change. */
  update(spec: ClaudeModsClientSpec): void {
    const json = JSON.stringify(spec)
    if (json === this.specJson || this.disposed) {
      return
    }
    const previous = this.spec
    this.spec = spec
    this.specJson = json
    const sameInstance =
      previous?.address.plugin === spec.address.plugin &&
      previous.address.module === spec.address.module &&
      previous.hash === spec.hash &&
      previous.loaded === spec.loaded
    if (sameInstance && this.instance) {
      this.instance.setProps(spec.props)
      return
    }
    this.restart()
  }

  resize(size: ClaudeModsClientSize): void {
    if (this.size?.columns === size.columns && this.size.rows === size.rows) {
      return
    }
    this.size = size
    if (this.instance) {
      this.instance.resize(size.columns, size.rows, size.auto)
    } else if (this.view.kind === 'fault' || !this.lease) {
      // While loading the size waits for the mount; a fault retries on a size of its site's.
      this.restart()
    }
  }

  key(event: ClaudeModsClientKeyEvent): boolean {
    return this.instance?.act('key', event) ?? false
  }

  pointer(event: ClaudeModsClientPointerEvent): boolean {
    return this.instance?.act('pointer', event) ?? false
  }

  dispose(): void {
    this.disposed = true
    this.unmount()
    this.stopFrames()
    this.viewListeners.clear()
  }

  private restart(): void {
    if (this.view.kind !== 'fault' || this.thrownAt !== this.retryKey()) {
      this.mount()
    }
  }

  private retryKey(): string {
    const size = this.size
    return `${this.specJson}|${size && !size.auto ? `${size.columns}x${size.rows}` : '*'}`
  }

  private mount(): void {
    const spec = this.spec
    this.unmount()
    if (!spec || !this.size || this.disposed) {
      return
    }
    const generation = this.generation
    this.relay = new ClaudeModsClientRelay(
      this.request,
      () => spec.address,
      (props) => {
        // A late answer for an instance already replaced is not this one's.
        if (generation === this.generation) {
          this.instance?.setProps(props)
        }
      }
    )
    this.setView({ kind: 'loading' })
    if (!spec.loaded) {
      this.fault('load', 'the plugin has no surface module loaded')
      return
    }
    const lease = this.frames.acquire(spec.address.plugin, spec.hash)
    this.lease = lease
    void lease.load.then((load) => {
      if (generation !== this.generation || lease.stale) {
        return
      }
      if (load.kind === 'unsupported') {
        this.setView({ kind: 'unsupported' })
      } else if (load.kind === 'failed') {
        this.fault('load', load.reason)
      } else {
        this.start(load.frame, spec)
      }
    })
  }

  private start(frame: ClaudeModsClientFrame, spec: ClaudeModsClientSpec): void {
    const { module, plugin, instance_id: siteId } = spec.address
    const entry = frame.bundle.modules.find((candidate) => candidate.module === module)
    const relay = this.relay
    const size = this.size
    if (!relay || !size) {
      return
    }
    if (!entry) {
      const loaded = frame.bundle.modules.map((candidate) => candidate.module).join(', ')
      this.fault('load', `the plugin loaded no surface module at that path (it loaded ${loaded})`)
      return
    }
    const generation = this.generation
    const current = (): boolean => generation === this.generation
    const instance = new ClaudeModsClientInstance(
      frame,
      `${this.serial}:${generation}`,
      plugin,
      relay,
      {
        drawn: (tree, listeners) => current() && this.setView({ kind: 'drawn', tree, listeners }),
        listened: (listeners) => {
          if (current() && this.view.kind === 'drawn') {
            this.setView({ ...this.view, listeners })
          }
        },
        failed: (phase, reason) => current() && this.fault(phase, reason),
        stale: () => current() && this.redrawSite(siteId)
      }
    )
    this.instance = instance
    instance.mount(entry, spec.props, size.columns, size.rows)
  }

  private fault(phase: ClaudeModsClientPhase, reason: string): void {
    // One request per fault line drawn: a second failure of the same instance is not news.
    if (this.view.kind === 'fault') {
      return
    }
    const spec = this.spec
    const relay = this.relay
    this.unmount()
    this.thrownAt = this.retryKey()
    const shown = reason.trim() || 'the module failed without a message'
    this.setView({
      kind: 'fault',
      line: `${spec?.address.plugin ?? ''}: Client ${spec?.address.module ?? ''}: ${shown}`
    })
    relay?.fault(phase, reason)
  }

  /** Ends the current instance; answers still in flight are ignored by generation. */
  private unmount(): void {
    this.generation += 1
    this.instance?.close()
    this.instance = null
    this.relay?.cancel()
    this.relay = null
    this.lease?.release()
    this.lease = null
  }

  private setView(view: ClaudeModsClientView): void {
    this.view = view
    for (const listener of this.viewListeners) {
      listener()
    }
  }
}
