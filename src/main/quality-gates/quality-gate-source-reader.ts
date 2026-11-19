import type { QualityGateSourceState } from '../../shared/quality-gate-types'
import type { QualityGateSourceTarget } from './quality-gate-source-state'

// Long enough for the burst that follows a change signal, when every subscriber asks for the
// status at once; short enough that an answer is never visibly older than the tree.
export const QUALITY_GATE_SOURCE_REUSE_MS = 250

export type QualityGateSourceReader = (
  target: QualityGateSourceTarget,
  /** `fresh`: the read must begin after this call. A run is tied to the tree it really checked. */
  options?: { fresh?: boolean }
) => Promise<QualityGateSourceState>

/**
 * One read of a worktree's commit and uncommitted state for everybody who asks at the same time.
 * A read costs two git commands and a stat per changed path, and the status is asked for by every
 * subscriber after every change signal.
 */
export function createQualityGateSourceReader(deps: {
  read: (target: QualityGateSourceTarget) => Promise<QualityGateSourceState>
  reuseMs?: number
}): QualityGateSourceReader {
  const reuseMs = deps.reuseMs ?? QUALITY_GATE_SOURCE_REUSE_MS
  const recent = new Map<string, Promise<QualityGateSourceState>>()

  return (target, options = {}) => {
    const key = `${target.wslDistro ?? ''}\0${target.git ? 'git' : 'folder'}\0${target.path}`
    const shared = options.fresh ? undefined : recent.get(key)
    if (shared) {
      return shared
    }
    const reading = deps.read(target)
    recent.set(key, reading)
    const forget = (): void => {
      if (recent.get(key) === reading) {
        recent.delete(key)
      }
    }
    reading.then(() => {
      const timer = setTimeout(forget, reuseMs)
      timer.unref?.()
    }, forget)
    return reading
  }
}
