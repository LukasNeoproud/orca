import { translate } from '@/i18n/i18n'
import { presentQualityGateStatus, type QualityGateStatusView } from './quality-gate-status-view'
import {
  summarizeWorkspaceQualityGates,
  workspaceQualityGatesSummaryLabel
} from './workspace-quality-gates-summary'

/** The one reading a workspace card has room for, most urgent first. */
export type WorkspaceQualityGatesCardState =
  | 'running'
  | 'failed'
  /** The host cannot say how a run ended, or did not answer at all. */
  | 'unknown'
  | 'outdated'
  | 'passed'
  /** Nothing is wrong, but a gate has no result yet. */
  | 'incomplete'

export type WorkspaceQualityGatesCardReading = {
  state: WorkspaceQualityGatesCardState
  label: string
}

/**
 * What the card shows for `view`, or null for nothing: no gates set up, a host from before gates,
 * no answer yet, or gates that never ran here.
 *
 * Why a lost host reads as unknown whatever was last seen: the commit and the files may have moved
 * since, and a silent host is no evidence that anything failed or still passes.
 */
export function readWorkspaceQualityGatesForCard(
  view: QualityGateStatusView
): WorkspaceQualityGatesCardReading | null {
  const status = view.unsupported ? null : presentQualityGateStatus(view)
  if (!status || status.gates.length === 0) {
    return null
  }
  const summary = summarizeWorkspaceQualityGates(status)
  if (summary.missing === status.gates.length) {
    return null
  }
  const counts = workspaceQualityGatesSummaryLabel(summary)
  if (view.contactLost) {
    return {
      state: 'unknown',
      label: translate(
        'qualityGates.cardContactLost',
        'Local gates: the host did not answer. Last known: {{value0}}',
        { value0: counts }
      )
    }
  }
  const state: WorkspaceQualityGatesCardState =
    summary.running > 0
      ? 'running'
      : summary.failed > 0
        ? 'failed'
        : summary.unknown > 0
          ? 'unknown'
          : summary.outdated > 0
            ? 'outdated'
            : summary.missing > 0
              ? 'incomplete'
              : 'passed'
  return {
    state,
    label: translate('qualityGates.cardLabel', 'Local gates: {{value0}}', { value0: counts })
  }
}
