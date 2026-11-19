import type {
  QualityGateRunView,
  QualityGateStatusResult
} from '../../../../shared/quality-gate-types'

export const QUALITY_GATE_LIVE_POLL_MS = 1_000
export const QUALITY_GATE_LOST_CONTACT_POLL_MS = 5_000
// A host without the change stream cannot say that a commit landed; a watching panel asks instead.
export const QUALITY_GATE_WATCH_POLL_MS = 5_000
// A background reader is one of many (a sidebar card per workspace), so it asks seldom.
export const QUALITY_GATE_BACKGROUND_LIVE_POLL_MS = 5_000
export const QUALITY_GATE_BACKGROUND_POLL_MS = 30_000

export type QualityGateStatusView = {
  /** Which host and workspace `status` belongs to; a view of another scope is stale. */
  scope: string
  status: QualityGateStatusResult | null
  /** The last request got no answer from the host. */
  contactLost: boolean
  /** The host predates quality gates. */
  unsupported: boolean
  /** What the host said when it refused. */
  error: string | null
}

export function emptyQualityGateStatusView(scope: string): QualityGateStatusView {
  return { scope, status: null, contactLost: false, unsupported: false, error: null }
}

export function hasLiveQualityGateRun(status: QualityGateStatusResult | null): boolean {
  return status?.gates.some((entry) => entry.latestRun?.liveness === 'live') ?? false
}

function unobserved(run: QualityGateRunView): QualityGateRunView {
  return {
    ...run,
    status: 'unverifiable',
    liveness: 'unverifiable',
    exitCode: null,
    freshness: null
  }
}

/**
 * What to show for `view`. A run that was live when the host stopped answering has an unknown
 * outcome: it is shown as unverifiable, never as failed and never as still running.
 */
export function presentQualityGateStatus(
  view: QualityGateStatusView
): QualityGateStatusResult | null {
  if (!view.status || !view.contactLost) {
    return view.status
  }
  return {
    ...view.status,
    gates: view.status.gates.map((entry) =>
      entry.latestRun?.liveness === 'live'
        ? { ...entry, latestRun: unobserved(entry.latestRun) }
        : entry
    )
  }
}

export type QualityGatePollMode = {
  /** A panel is showing the status and wants it to follow the workspace without a manual refresh. */
  watch: boolean
  /** The host's change stream is open, so it says when to read again. */
  streaming: boolean
  /** One of many watchers rather than the panel in front of the user. */
  background?: boolean
}

/** Whether the host said the workspace has no gate at all: nothing there can change. */
export function hasNoQualityGates(view: QualityGateStatusView): boolean {
  return view.status !== null && view.status.gates.length === 0
}

/** When to ask the host again, or null when nothing would be learned by asking. */
export function nextQualityGatePollDelay(
  view: QualityGateStatusView,
  mode: QualityGatePollMode = { watch: false, streaming: false }
): number | null {
  if (view.unsupported) {
    return null
  }
  const background = mode.background === true
  // A background reader of a workspace without gates stops; it starts over when the gates change.
  if (background && !view.contactLost && hasNoQualityGates(view)) {
    return null
  }
  if (view.contactLost) {
    // A watching panel keeps asking so it recovers by itself once the host answers again.
    if (!mode.watch && !hasLiveQualityGateRun(view.status)) {
      return null
    }
    return background ? QUALITY_GATE_BACKGROUND_POLL_MS : QUALITY_GATE_LOST_CONTACT_POLL_MS
  }
  if (mode.streaming) {
    return null
  }
  if (hasLiveQualityGateRun(view.status)) {
    return background ? QUALITY_GATE_BACKGROUND_LIVE_POLL_MS : QUALITY_GATE_LIVE_POLL_MS
  }
  if (!mode.watch) {
    return null
  }
  return background ? QUALITY_GATE_BACKGROUND_POLL_MS : QUALITY_GATE_WATCH_POLL_MS
}
