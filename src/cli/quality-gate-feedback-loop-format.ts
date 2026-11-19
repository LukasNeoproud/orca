import {
  readQualityGateFeedbackLoopStatus,
  type QualityGateFeedbackLoopStatus
} from '../shared/quality-gate-feedback-loop'

const STOP_REASONS: Record<string, string> = {
  'round-limit': 'the round limit was reached',
  'no-improvement': 'the last round changed nothing',
  'not-deliverable': 'the agent could not be sent a message',
  'user-input': 'somebody typed into the terminal of the agent',
  'user-message': 'the user sent the agent a message',
  'agent-interrupted': 'the agent was interrupted',
  'agent-gone': 'the agent is gone',
  disabled: 'the loop was turned off',
  'gates-inconclusive': 'a gate was stopped or could not run'
}

function because(status: QualityGateFeedbackLoopStatus): string {
  const reason = status.stopReason ? STOP_REASONS[status.stopReason] : undefined
  return reason ? `: ${reason}` : ''
}

function stateText(status: QualityGateFeedbackLoopStatus): string {
  switch (status.state) {
    case 'idle':
      return 'no agent step checked yet'
    case 'checking':
      return 'running the required gates for a finished agent step'
    case 'awaiting-agent':
      return `failures sent to the agent, round ${status.round} of ${status.maxRounds}`
    case 'passed':
      return 'the required gates passed after the last agent step'
    case 'needs-user':
      return `failures are waiting for you${because(status)}`
    case 'stopped':
      return `stopped${because(status)}`
  }
}

/** One line for `orca gates status`; null when the host reports no loop (an older host). */
export function formatQualityGateFeedbackLoop(value: unknown): string | null {
  const status = readQualityGateFeedbackLoopStatus(value)
  if (!status) {
    return null
  }
  if (!status.repoEnabled) {
    return 'Feedback loop: off (turned on per repository in the Orca app).'
  }
  if (status.workspaceDisabled) {
    return 'Feedback loop: off for this workspace.'
  }
  return `Feedback loop: on, ${stateText(status)}.`
}
