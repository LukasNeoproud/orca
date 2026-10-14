// One site's scroll conversation with the engine. The person's moves go out as row deltas, one
// request in flight at a time with the rest summed; the engine owns the offset and its answer
// (or a plugin's push) says where the window must be. `follow_end` keeps it on the last rows.

import type { ClaudeModsSiteLayout } from './claude-mods-layout-measure'

export type ClaudeModsScrollDeps = {
  component: string
  instanceId: string
  request: (fields: Record<string, unknown>) => Promise<unknown>
  read: () => ClaudeModsSiteLayout
  /** Moves the window (to the last rows when `toEnd`) and returns the offset it landed on. */
  scrollTo: (offset: number, toEnd: boolean) => number
  /** Runs `run` on the next frame; returns a canceller. */
  schedule: (run: () => void) => () => void
}

export type ClaudeModsScrollPointer = { column: number; row: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class ClaudeModsScrollSync {
  /** The window's offset as the engine last heard or set it; deltas are counted from here. */
  private reported = 0
  private pendingBy = 0
  private pointer: ClaudeModsScrollPointer | undefined
  private inFlight = false
  private cancelFrame: (() => void) | null = null
  private following = false
  /** A plugin's offset the content was too short to reach yet. */
  private wanted: number | null = null

  constructor(private readonly deps: ClaudeModsScrollDeps) {}

  get isFollowingEnd(): boolean {
    return this.following
  }

  /** The window sits at `offset` for a reason that is not the person (layout, a redraw). */
  settled(offset: number): void {
    this.reported = offset
  }

  /** The person scrolled the window to `offset`; `atEnd` says it now shows the last rows. */
  moved(offset: number, atEnd: boolean, pointer?: ClaudeModsScrollPointer): void {
    const by = offset - this.reported
    this.reported = offset
    if (by === 0) {
      return
    }
    this.wanted = null
    if (by < 0 && !atEnd) {
      this.following = false
    }
    this.queue(by, pointer)
  }

  /** A wheel or key pushed against an edge: nothing moved, but a hook may want to hear it. */
  pushedAgainstEdge(by: number, pointer?: ClaudeModsScrollPointer): void {
    if (by !== 0) {
      this.queue(by, pointer)
    }
  }

  /** A plugin's `ui_scroll` push. `end` arrives twice: first without the flag, then with it. */
  push(offset: number, followEnd: boolean): void {
    this.pendingBy = 0
    this.cancelFrame?.()
    this.cancelFrame = null
    this.following = followEnd
    const landed = this.deps.scrollTo(offset, followEnd)
    this.reported = landed
    this.wanted = !followEnd && landed < offset ? offset : null
  }

  /** After a drawing or a resize: keep the end pinned, or reach an offset content now allows. */
  afterLayout(): void {
    if (this.following) {
      this.reported = this.deps.scrollTo(0, true)
    } else if (this.wanted !== null) {
      const landed = this.deps.scrollTo(this.wanted, false)
      this.reported = landed
      if (landed >= this.wanted) {
        this.wanted = null
      }
    }
  }

  dispose(): void {
    this.cancelFrame?.()
    this.cancelFrame = null
    this.pendingBy = 0
  }

  private queue(by: number, pointer?: ClaudeModsScrollPointer): void {
    this.pendingBy += by
    this.pointer = pointer ?? this.pointer
    if (!this.inFlight && !this.cancelFrame) {
      this.cancelFrame = this.deps.schedule(() => {
        this.cancelFrame = null
        this.flush()
      })
    }
  }

  private flush(): void {
    if (this.pendingBy === 0 || this.inFlight) {
      return
    }
    const by = this.pendingBy
    const pointer = this.pointer
    this.pendingBy = 0
    this.pointer = undefined
    this.inFlight = true
    const layout = this.deps.read()
    void this.deps
      .request({
        component: this.deps.component,
        instance_id: this.deps.instanceId,
        offset: layout.offset,
        by,
        body_rows: layout.bodyRows,
        content_rows: layout.contentRows,
        ...(layout.keyed.length > 0 ? { keyed: layout.keyed } : {}),
        ...(pointer ? { pointer } : {})
      })
      .then((answer) => this.answered(answer))
  }

  private answered(answer: unknown): void {
    this.inFlight = false
    if (this.pendingBy !== 0) {
      // Moves piled up behind this one: the last answer is the one the window follows.
      this.queue(0)
      if (isRecord(answer)) {
        this.following = answer.follow_end === true
      }
      return
    }
    if (!isRecord(answer)) {
      return
    }
    this.following = answer.follow_end === true
    const now = this.deps.read().offset
    const target = typeof answer.offset === 'number' ? answer.offset : now
    this.reported =
      this.following || target !== now ? this.deps.scrollTo(target, this.following) : now
  }
}
