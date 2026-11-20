import { translate } from '@/i18n/i18n'
import {
  readQualityGateFeedbackLoopStatus,
  type QualityGateFeedbackLoopStatus,
  type QualityGateFeedbackLoopStopReason
} from '../../../../shared/quality-gate-feedback-loop'
import type { QualityGateStatusView } from './quality-gate-status-view'

/**
 * - `active`: the required gates are running for a step, or the agent is fixing what failed.
 * - `off`: the repository has the loop on and this workspace turned it off.
 * - `unknown`: the host did not answer, so nothing it last said is known to hold.
 */
export type QualityGateFeedbackLoopTone =
  | 'active'
  | 'passed'
  | 'needs-user'
  | 'stopped'
  | 'idle'
  | 'off'
  | 'unknown'

export type QualityGateFeedbackLoopReading = {
  tone: QualityGateFeedbackLoopTone
  text: string
  loop: QualityGateFeedbackLoopStatus
}

export const QUALITY_GATE_FEEDBACK_LOOP_TONE_CLASS: Record<QualityGateFeedbackLoopTone, string> = {
  active: 'text-muted-foreground',
  passed: 'text-status-success',
  'needs-user': 'text-destructive',
  stopped: 'text-muted-foreground',
  idle: 'text-muted-foreground',
  off: 'text-muted-foreground',
  unknown: 'text-status-warning'
}

const STOP_REASON_LABELS: Record<QualityGateFeedbackLoopStopReason, () => string> = {
  'round-limit': () =>
    translate('qualityGates.loopReasonRoundLimit', 'the round limit was reached'),
  'no-improvement': () =>
    translate('qualityGates.loopReasonNoImprovement', 'the last round changed nothing'),
  'not-deliverable': () =>
    translate('qualityGates.loopReasonNotDeliverable', 'the agent could not be sent a message'),
  'user-input': () =>
    translate('qualityGates.loopReasonUserInput', "someone typed in the agent's terminal"),
  'user-message': () =>
    translate('qualityGates.loopReasonUserMessage', 'the agent got another message'),
  'agent-interrupted': () =>
    translate('qualityGates.loopReasonAgentInterrupted', 'the agent was interrupted'),
  'agent-gone': () => translate('qualityGates.loopReasonAgentGone', 'the agent closed'),
  disabled: () => translate('qualityGates.loopReasonDisabled', 'it was turned off'),
  'gates-inconclusive': () =>
    translate('qualityGates.loopReasonGatesInconclusive', 'a gate gave no result'),
  'run-refused': () =>
    translate(
      'qualityGates.loopReasonRunRefused',
      'gates do not run in a static review; choose Build or Build and run tests in a new AI review'
    )
}

function isKnownStopReason(reason: string): reason is QualityGateFeedbackLoopStopReason {
  return Object.hasOwn(STOP_REASON_LABELS, reason)
}

/** Null for a reason this build does not know: the state alone is shown. */
function stopReasonLabel(reason: string | undefined): string | null {
  return reason && isKnownStopReason(reason) ? STOP_REASON_LABELS[reason]() : null
}

function describe(
  loop: QualityGateFeedbackLoopStatus,
  contactLost: boolean
): Omit<QualityGateFeedbackLoopReading, 'loop'> {
  const rounds = { value0: loop.round, value1: loop.maxRounds }
  if (contactLost) {
    return {
      tone: 'unknown',
      text: translate('qualityGates.loopUnknown', 'Unknown until the host answers')
    }
  }
  if (loop.workspaceDisabled) {
    return { tone: 'off', text: translate('qualityGates.loopOff', 'Off in this workspace') }
  }
  const reason = stopReasonLabel(loop.stopReason)
  switch (loop.state) {
    case 'idle':
      return {
        tone: 'idle',
        text: translate('qualityGates.loopIdle', 'Waiting for an agent to finish a step')
      }
    case 'checking':
      return {
        tone: 'active',
        text:
          loop.round === 0
            ? translate('qualityGates.loopCheckingStep', "Checking the agent's step")
            : translate(
                'qualityGates.loopCheckingFix',
                'Round {{value0}} of {{value1}}: checking the fix',
                rounds
              )
      }
    case 'awaiting-agent':
      return {
        tone: 'active',
        text: translate(
          'qualityGates.loopAwaitingAgent',
          "Round {{value0}} of {{value1}}: waiting for the agent's fix",
          rounds
        )
      }
    case 'passed':
      return {
        tone: 'passed',
        text:
          loop.round === 0
            ? translate('qualityGates.loopPassed', 'Passed')
            : translate(
                'qualityGates.loopPassedAfter',
                'Passed after round {{value0}} of {{value1}}',
                rounds
              )
      }
    case 'needs-user':
      return {
        tone: 'needs-user',
        text: reason
          ? translate('qualityGates.loopNeedsUserBecause', 'Findings wait for you: {{value0}}', {
              value0: reason
            })
          : translate('qualityGates.loopNeedsUser', 'Findings wait for you')
      }
    case 'stopped':
      return {
        tone: 'stopped',
        text: reason
          ? translate('qualityGates.loopStoppedBecause', 'Stopped: {{value0}}', { value0: reason })
          : translate('qualityGates.loopStopped', 'Stopped')
      }
  }
}

/**
 * What to show of the feedback loop for `view`, or null for nothing: a host from before the loop
 * (no `feedbackLoop` in its status), and a repository that has the loop off.
 */
export function readQualityGateFeedbackLoop(
  view: QualityGateStatusView
): QualityGateFeedbackLoopReading | null {
  if (view.unsupported || !view.status) {
    return null
  }
  const loop = readQualityGateFeedbackLoopStatus(view.status.feedbackLoop)
  if (!loop?.repoEnabled) {
    return null
  }
  return { loop, ...describe(loop, view.contactLost) }
}
