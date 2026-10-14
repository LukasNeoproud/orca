import type {
  ClaudeModsRequestSubtype,
  ClaudeModsSurfaceEvent
} from '../../../../../../shared/claude-mods-surface'
import {
  readClaudeModsClientBundle,
  type ClaudeModsClientBundle
} from './claude-mods-client-bundle'
import {
  ClaudeModsClientFrame,
  createClaudeModsClientWorker,
  type ClaudeModsClientWorkerFactory
} from './claude-mods-client-frame'

/** The part of the chat's mods controller the frames use. */
export type ClaudeModsClientHost = {
  /** Rejects on failure instead of answering null, so a refusal shows. */
  requestStrict: (
    subtype: ClaudeModsRequestSubtype,
    fields: Record<string, unknown>
  ) => Promise<unknown>
  onPush: (listener: (event: ClaudeModsSurfaceEvent) => void) => () => void
}

export type ClaudeModsClientFrameLoad =
  | { kind: 'ready'; frame: ClaudeModsClientFrame }
  /** The host or CLI answered nothing: one that predates surface modules, or refused this one. */
  | { kind: 'unsupported' }
  | { kind: 'failed'; reason: string }

/** A pane switch or a redraw that briefly drops a Client keeps its plugin's frame warm. */
const IDLE_DISPOSE_MS = 10_000
/**
 * When a `ui_client_module` that failed without a refusal is asked again: a few spaced retries
 * tell a one-off timeout from a host that never answers, after which the plugin stays
 * unsupported until the session or its hash changes.
 */
export const CLAUDE_MODS_CLIENT_MODULE_RETRY_MS = [1_000, 4_000, 15_000, 60_000]

/** An old CLI or Orca host rejecting the subtype itself: the error names it or the params enum. */
// The refusal texts only: a timeout also names the subtype (`claude ui_client_module request timed out`).
const REFUSED_SUBTYPE = /Unsupported control request subtype|Invalid option: expected one of/i

function refusesSubtype(error: unknown): boolean {
  return error instanceof Error && REFUSED_SUBTYPE.test(error.message)
}

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
  retry: ReturnType<typeof setTimeout> | null
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
  /** Unanswered `ui_client_module` requests in a row, per plugin. */
  private readonly unanswered = new Map<string, number>()
  /** The CLI or host refused the subtype: nothing is asked again this session. */
  private refused = false
  private closed = false

  constructor(
    private readonly host: ClaudeModsClientHost,
    private readonly createWorker: ClaudeModsClientWorkerFactory = createClaudeModsClientWorker
  ) {
    // A new child is a new session: its plugins' modules load afresh.
    this.stopPush = host.onPush((event) => {
      if (event.type === 'state') {
        this.unanswered.clear()
        this.refused = false
        this.disposeAll()
      }
    })
  }

  /** The frame for `plugin` at `hash` (undefined: whatever is loaded); release when done. */
  acquire(plugin: string, hash: string | undefined): ClaudeModsClientLease {
    if (this.closed) {
      // The controller stopped: nothing starts a worker or sends a request any more.
      return { load: Promise.resolve({ kind: 'unsupported' }), stale: true, release: () => {} }
    }
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
    // Closed first: a Client hearing its frame go must not acquire, and so load, a new one.
    this.closed = true
    this.listeners.clear()
    this.stopPush()
    this.disposeAll()
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
    // A frame a runaway call took down restarts from the text it already holds.
    const dead = current?.frame?.dead ? current.frame.bundle : undefined
    const reuse = dead && (hash === undefined || hash === dead.hash) ? dead : undefined
    const entry: Entry = {
      hash,
      superseded,
      load: Promise.resolve({ kind: 'unsupported' }),
      frame: null,
      disposed: false,
      failed: false,
      users: 0,
      idle: null,
      retry: null
    }
    entry.load = this.load(plugin, entry, reuse).then((load) => {
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

  private async load(
    plugin: string,
    entry: Entry,
    reuse: ClaudeModsClientBundle | undefined
  ): Promise<ClaudeModsClientFrameLoad> {
    const fetched = reuse ? { ok: true as const, bundle: reuse } : await this.fetch(plugin, entry)
    if (!fetched.ok) {
      return fetched.load
    }
    if (entry.disposed) {
      return { kind: 'failed', reason: 'its frame was replaced' }
    }
    const { bundle } = fetched
    const frame = new ClaudeModsClientFrame(bundle, this.createWorker)
    entry.frame = frame
    // The answer's own hash names this text; a site announcing it later reuses the frame.
    if (entry.hash !== bundle.hash) {
      entry.superseded.add(bundle.hash)
    }
    const ready = await frame.ready
    if (!ready.ok) {
      frame.dispose()
      return { kind: 'failed', reason: `the surface module did not load: ${ready.reason}` }
    }
    return { kind: 'ready', frame }
  }

  private async fetch(
    plugin: string,
    entry: Entry
  ): Promise<
    { ok: true; bundle: ClaudeModsClientBundle } | { ok: false; load: ClaudeModsClientFrameLoad }
  > {
    const unsupported = { ok: false as const, load: { kind: 'unsupported' as const } }
    if (this.refused) {
      return unsupported
    }
    let answer: unknown = null
    try {
      answer = await this.host.requestStrict('ui_client_module', { plugin })
    } catch (error) {
      if (refusesSubtype(error)) {
        this.refused = true
        return unsupported
      }
    }
    if (answer === null || answer === undefined) {
      this.retryLater(plugin, entry)
      return unsupported
    }
    this.unanswered.delete(plugin)
    const read = readClaudeModsClientBundle(answer)
    return read.ok ? read : { ok: false, load: { kind: 'failed', reason: read.reason } }
  }

  /** Drops an unanswered entry after a backoff, so its Clients mount again and ask anew. */
  private retryLater(plugin: string, entry: Entry): void {
    const attempt = (this.unanswered.get(plugin) ?? 0) + 1
    this.unanswered.set(plugin, attempt)
    const delay = CLAUDE_MODS_CLIENT_MODULE_RETRY_MS[attempt - 1]
    if (delay === undefined || entry.disposed) {
      return
    }
    entry.retry = setTimeout(() => {
      entry.retry = null
      if (this.entries.get(plugin) === entry) {
        this.dispose(plugin, entry)
      }
    }, delay)
  }

  private dispose(plugin: string, entry: Entry): void {
    if (entry.idle) {
      clearTimeout(entry.idle)
      entry.idle = null
    }
    if (entry.retry) {
      clearTimeout(entry.retry)
      entry.retry = null
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

// A stopped controller keeps its closed frames, so a Client drawn during teardown starts nothing.
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
  const frames = framesByHost.get(host) ?? new ClaudeModsClientFrames(host)
  frames.close()
  framesByHost.set(host, frames)
}
