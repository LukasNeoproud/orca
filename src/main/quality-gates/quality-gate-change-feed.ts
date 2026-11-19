import type { QualityGateSourceState } from '../../shared/quality-gate-types'
import type { QualityGateSourceTarget } from './quality-gate-source-state'

// A commit or an edit has no event to hang on that covers WSL and every editor, so the tree is
// re-read while somebody is watching and never otherwise.
export const QUALITY_GATE_SOURCE_WATCH_MS = 3_000

export type QualityGateChangeFeedDeps = {
  readSource: (target: QualityGateSourceTarget) => Promise<QualityGateSourceState>
  watchIntervalMs?: number
}

type Watch = {
  source: QualityGateSourceTarget
  listeners: Set<() => void>
  timer: ReturnType<typeof setTimeout> | null
  /** Null until the first read: nothing to compare with yet. */
  lastSeen: string | null
}

export type QualityGateChangeFeed = ReturnType<typeof createQualityGateChangeFeed>

/**
 * Tells subscribers of a worktree that what `qualityGates.status` returns may have changed: a run
 * moved, a commit landed or a file was edited. It carries no state of its own.
 */
export function createQualityGateChangeFeed(deps: QualityGateChangeFeedDeps) {
  const watches = new Map<string, Watch>()
  const intervalMs = deps.watchIntervalMs ?? QUALITY_GATE_SOURCE_WATCH_MS

  function notify(worktreeId: string): void {
    for (const listener of watches.get(worktreeId)?.listeners ?? []) {
      listener()
    }
  }

  function schedule(worktreeId: string, watch: Watch): void {
    // A folder has no commit and no tracked tree; only its runs change.
    if (!watch.source.git) {
      return
    }
    watch.timer = setTimeout(() => void check(worktreeId, watch), intervalMs)
    watch.timer.unref?.()
  }

  async function check(worktreeId: string, watch: Watch): Promise<void> {
    let seen: string | null = null
    try {
      const source = await deps.readSource(watch.source)
      seen = `${source.head}\0${source.fingerprint}`
    } catch {
      // An unreadable tree is not a change; the next round tries again.
    }
    if (watches.get(worktreeId) !== watch) {
      return
    }
    if (seen !== null) {
      if (watch.lastSeen !== null && watch.lastSeen !== seen) {
        notify(worktreeId)
      }
      watch.lastSeen = seen
    }
    schedule(worktreeId, watch)
  }

  return {
    notify,

    /** `listener` is called with no argument: the subscriber reads the status itself. */
    subscribe(
      target: { worktreeId: string; source: QualityGateSourceTarget },
      listener: () => void
    ): () => void {
      let watch = watches.get(target.worktreeId)
      if (!watch) {
        watch = { source: target.source, listeners: new Set(), timer: null, lastSeen: null }
        watches.set(target.worktreeId, watch)
        void check(target.worktreeId, watch)
      }
      const joined = watch
      joined.listeners.add(listener)
      return () => {
        joined.listeners.delete(listener)
        if (joined.listeners.size === 0 && watches.get(target.worktreeId) === joined) {
          watches.delete(target.worktreeId)
          if (joined.timer !== null) {
            clearTimeout(joined.timer)
          }
        }
      }
    },

    /** For tests: how many worktrees are being watched. */
    watchedCount: () => watches.size
  }
}
