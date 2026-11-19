import { translate } from '@/i18n/i18n'
import {
  qualityGateRunHasResult,
  type QualityGateStatusResult
} from '../../../../shared/quality-gate-types'

export type WorkspaceQualityGatesSummary = {
  passed: number
  /** Failed, timed out or could not start: the gate did not pass and somebody has to look. */
  failed: number
  running: number
  /** A result from before a later commit, edit or change of the gate. */
  outdated: number
  /** The host cannot say how the run ended. */
  unknown: number
  /** Never run here, or stopped before it gave a result. */
  missing: number
}

/** Counts for the section heading. A passed gate whose result is out of date counts as outdated only. */
export function summarizeWorkspaceQualityGates(
  status: QualityGateStatusResult
): WorkspaceQualityGatesSummary {
  const summary: WorkspaceQualityGatesSummary = {
    passed: 0,
    failed: 0,
    running: 0,
    outdated: 0,
    unknown: 0,
    missing: 0
  }
  for (const { latestRun: run } of status.gates) {
    if (!run || run.status === 'cancelled') {
      summary.missing += 1
    } else if (run.liveness === 'live') {
      summary.running += 1
    } else if (run.liveness === 'unverifiable') {
      summary.unknown += 1
    } else if (qualityGateRunHasResult(run.status) && run.freshness?.state === 'stale') {
      summary.outdated += 1
    } else if (run.status === 'passed') {
      summary.passed += 1
    } else {
      summary.failed += 1
    }
  }
  return summary
}

/** The heading's short reading of the counts, most urgent first; zero counts are left out. */
export function workspaceQualityGatesSummaryLabel(summary: WorkspaceQualityGatesSummary): string {
  const parts = [
    summary.running > 0
      ? translate('qualityGates.summaryRunning', '{{value0}} running', { value0: summary.running })
      : null,
    summary.failed > 0
      ? translate('qualityGates.summaryFailed', '{{value0}} failed', { value0: summary.failed })
      : null,
    summary.unknown > 0
      ? translate('qualityGates.summaryUnknown', '{{value0}} unknown', { value0: summary.unknown })
      : null,
    summary.outdated > 0
      ? translate('qualityGates.summaryOutdated', '{{value0}} out of date', {
          value0: summary.outdated
        })
      : null,
    summary.passed > 0
      ? translate('qualityGates.summaryPassed', '{{value0}} passed', { value0: summary.passed })
      : null,
    summary.missing > 0
      ? translate('qualityGates.summaryMissing', '{{value0}} not run', { value0: summary.missing })
      : null
  ]
  return parts.filter((part) => part !== null).join(' · ')
}
