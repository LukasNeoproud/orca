import type {
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent
} from '../../../../../../shared/claude-mods-surface'
import { readClaudeModsClientBundle } from './claude-mods-client-bundle'
import {
  ClaudeModsClientFrame,
  createClaudeModsClientWorker,
  type ClaudeModsClientWorkerFactory
} from './claude-mods-client-frame'

/** The part of the chat's mods controller the frames use. */
export type ClaudeModsClientHost = {
  request: (subtype: ClaudeModsRequestSubtype, fields: Record<string, unknown>) => Promise<unknown>
  onPush: (listener: (event: ClaudeModsSurfaceEvent) => void) => () => void
}

export type ClaudeModsClientFrameLoad =
  | { kind: 'ready'; frame: ClaudeModsClientFrame }
  /** The host or CLI answered nothing: one that predates surface modules, or refused this one. */
  | { kind: 'unsupported' }
  | { kind: 'failed'; reason: string }

/** A pane switch or a redraw that briefly drops a Client keeps its plugin's frame warm. */
const IDLE_DISPOSE_MS = 10_000

type Entry = {
  hash: string | undefined
  /** Hashes this entry superseded: a site still drawing one must not swap the frame back. */
  superseded: Set<string>
  load: Promise<ClaudeModsClientFrameLoad>
  frame: ClaudeModsClientFrame | null
  disposed: boolean
  /** A load that failed is tried again by the next Client that asks. */
  failed: boolean
  users: number
  idle: ReturnType<typeof setTimeout> | null
}

export type ClaudeModsClientLease = {
  load: Promise<ClaudeModsClientFrameLoad>
  /** True once the frame was replaced or dropped; its Clients mount again on a fresh lease. */
  readonly stale: boolean
  release: () => void
}

/** One controller's surface-module frames: one worker per plugin, at the hash it last announced. */
export class ClaudeModsClientFrames {
  private readonly entries = new Map<string, Entry>()
  private readonly listeners = new Set<(plugin: string) => void>()
  private readonly stopPush: () => void

  constructor(
    private readonly host: ClaudeModsClientHost,
    private readonly createWorker: ClaudeModsClientWorkerFactory = createClaudeModsClientWorker
  ) {
    // A new child is a new session: its plugins' modules load afresh.
    this.stopPush = host.onPush((event) => {
      if (event.type === 'state') {
        this.disposeAll()
      }
    })
  }

  /** The frame for `plugin` at `hash` (undefined: whatever is loaded); release when done. */
  acquire(plugin: string, hash: string | undefined): ClaudeModsClientLease {
    const entry = this.entryFor(plugin, hash)
    entry.users += 1
    if (entry.idle) {
      clearTimeout(entry.idle)
      entry.idle = null
    }
    let released = false
    return {
      load: entry.load,
      get stale() {
        return entry.disposed
      },
      release: () => {
        if (released) {
          return
        }
        released = true
        entry.users -= 1
        if (entry.users === 0 && !entry.disposed) {
          entry.idle = setTimeout(() => this.dispose(plugin, entry), IDLE_DISPOSE_MS)
        }
      }
    }
  }

  /** Hears a plugin's frame being replaced or dropped, so its Clients mount again. */
  subscribe(listener: (plugin: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  disposeAll(): void {
    for (const [plugin, entry] of Array.from(this.entries)) {
      this.dispose(plugin, entry)
    }
  }

  close(): void {
    this.stopPush()
    this.disposeAll()
    this.listeners.clear()
  }

  private entryFor(plugin: string, hash: string | undefined): Entry {
    const current = this.entries.get(plugin)
    const reusable =
      current &&
      !current.disposed &&
      !current.failed &&
      !current.frame?.dead &&
      (hash === undefined || hash === current.hash || current.superseded.has(hash))
    if (current && reusable) {
      return current
    }
    const superseded = new Set(current?.superseded)
    if (current?.hash !== undefined && current.hash !== hash) {
      superseded.add(current.hash)
    }
    const entry: Entry = {
      hash,
      superseded,
      load: Promise.resolve({ kind: 'unsupported' }),
      frame: null,
      disposed: false,
      failed: false,
      users: 0,
      idle: null
    }
    entry.load = this.load(plugin, entry).then((load) => {
      entry.failed = load.kind === 'failed'
      return load
    })
    // Set before the old one goes, so its Clients re-acquiring from the notice find this one.
    this.entries.set(plugin, entry)
    if (current) {
      this.dispose(plugin, current)
    }
    return entry
  }

  private async load(plugin: string, entry: Entry): Promise<ClaudeModsClientFrameLoad> {
    const answer = await this.host.request('ui_client_module', { plugin })
    if (answer === null || answer === undefined) {
      return { kind: 'unsupported' }
    }
    const read = readClaudeModsClientBundle(answer)
    if (!read.ok) {
      return { kind: 'failed', reason: read.reason }
    }
    if (entry.disposed) {
      return { kind: 'failed', reason: 'its frame was replaced' }
    }
    const frame = new ClaudeModsClientFrame(read.bundle, this.createWorker)
    entry.frame = frame
    // The answer's own hash names this text; a site announcing it later reuses the frame.
    if (entry.hash !== read.bundle.hash) {
      entry.superseded.add(read.bundle.hash)
    }
    const ready = await frame.ready
    if (!ready.ok) {
      frame.dispose()
      return { kind: 'failed', reason: `the surface module did not load: ${ready.reason}` }
    }
    return { kind: 'ready', frame }
  }

  private dispose(plugin: string, entry: Entry): void {
    if (entry.idle) {
      clearTimeout(entry.idle)
      entry.idle = null
    }
    if (entry.disposed) {
      return
    }
    entry.disposed = true
    entry.frame?.dispose()
    if (this.entries.get(plugin) === entry) {
      this.entries.delete(plugin)
    }
    for (const listener of this.listeners) {
      listener(plugin)
    }
  }
}

const framesByHost = new WeakMap<ClaudeModsClientHost, ClaudeModsClientFrames>()

/** The frames of one chat's controller, made on first use. */
export function claudeModsClientFramesFor(host: ClaudeModsClientHost): ClaudeModsClientFrames {
  let frames = framesByHost.get(host)
  if (!frames) {
    frames = new ClaudeModsClientFrames(host)
    framesByHost.set(host, frames)
  }
  return frames
}

/** Terminates every worker of a controller's Clients; call when the controller stops. */
export function disposeClaudeModsClientFrames(host: ClaudeModsClientHost): void {
  framesByHost.get(host)?.close()
  framesByHost.delete(host)
}
