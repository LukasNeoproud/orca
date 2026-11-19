import { translate } from '@/i18n/i18n'
import {
  QUALITY_GATE_LIMITS,
  type QualityGateFreshness,
  type QualityGateRun,
  type QualityGateRunStatus
} from '../../../../shared/quality-gate-types'
import type { QualityGateDraftErrors } from './quality-gate-settings-draft'

export function qualityGateStatusLabel(status: QualityGateRunStatus): string {
  switch (status) {
    case 'queued':
      return translate('qualityGates.statusQueued', 'Queued')
    case 'running':
      return translate('qualityGates.statusRunning', 'Running')
    case 'passed':
      return translate('qualityGates.statusPassed', 'Passed')
    case 'failed':
      return translate('qualityGates.statusFailed', 'Failed')
    case 'timed-out':
      return translate('qualityGates.statusTimedOut', 'Timed out')
    case 'not-started':
      return translate('qualityGates.statusNotStarted', 'Could not start')
    case 'cancelled':
      return translate('qualityGates.statusCancelled', 'Stopped')
    case 'unverifiable':
      return translate('qualityGates.statusUnverifiable', 'Outcome unknown')
  }
}

/** The line under a run: why it was stopped or never started. A host from before `stopReason` only has `error`. */
export function qualityGateRunNote(
  run: Pick<QualityGateRun, 'error' | 'stopReason'>
): string | null {
  if (run.stopReason === 'app-quit') {
    return translate(
      'qualityGates.stoppedByQuit',
      'Stopped because Orca quit while the gate was running.'
    )
  }
  return run.error
}

function staleReasonLabel(reason: string): string {
  switch (reason) {
    case 'head-changed':
      return translate('qualityGates.staleHeadChanged', 'another commit')
    case 'tree-changed':
      return translate('qualityGates.staleTreeChanged', 'files changed')
    case 'gate-changed':
      return translate('qualityGates.staleGateChanged', 'gate edited')
    default:
      return reason
  }
}

/** Null when there is nothing to say: a run still in progress, or one whose outcome is unknown. */
export function qualityGateFreshnessLabel(
  freshness: QualityGateFreshness | null
): { text: string; stale: boolean } | null {
  if (!freshness) {
    return null
  }
  switch (freshness.state) {
    case 'current':
      return { text: translate('qualityGates.freshnessCurrent', 'Up to date'), stale: false }
    case 'stale':
      return {
        text: translate('qualityGates.freshnessStale', 'Out of date: {{value0}}', {
          value0: freshness.reasons.map(staleReasonLabel).join(', ')
        }),
        stale: true
      }
    case 'unlinked':
      return {
        text: translate('qualityGates.freshnessUnlinked', 'Not tied to a commit'),
        stale: false
      }
    case 'unknown':
      return {
        text: translate(
          'qualityGates.freshnessUnknown',
          'Could not be compared with the workspace'
        ),
        stale: true
      }
  }
}

export function qualityGateDraftErrorLabel(
  field: keyof QualityGateDraftErrors,
  errors: QualityGateDraftErrors
): string | null {
  switch (errors[field]) {
    case undefined:
      return null
    case 'empty':
      return field === 'name'
        ? translate('qualityGates.errorNameEmpty', 'Enter a name.')
        : translate('qualityGates.errorCommandEmpty', 'Enter a command.')
    case 'too-long':
      return translate('qualityGates.errorTooLong', 'Use at most {{value0}} characters.', {
        value0:
          field === 'name'
            ? QUALITY_GATE_LIMITS.maxNameLength
            : QUALITY_GATE_LIMITS.maxCommandLength
      })
    case 'duplicate':
      return translate('qualityGates.errorNameDuplicate', 'Another gate already has this name.')
    case 'invalid':
      return translate(
        'qualityGates.errorTimeoutInvalid',
        'Enter a whole number from {{value0}} to {{value1}}.',
        {
          value0: QUALITY_GATE_LIMITS.minTimeoutSeconds,
          value1: QUALITY_GATE_LIMITS.maxTimeoutSeconds
        }
      )
  }
}
