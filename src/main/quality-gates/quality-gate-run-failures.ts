import { qualityGateRunLiveness } from '../../shared/quality-gate-types'
import type { QualityGateFeedbackFailure } from './quality-gate-feedback-prompt'
import type { QualityGateService } from './quality-gate-service'
import type { QualityGateTarget } from './quality-gate-target'

/**
 * Waits for the given runs to end and returns those that failed. `inconclusive` when a run did
 * not start, was cancelled or ended unknown: that is neither a pass nor a failure to send back.
 */
export async function collectQualityGateFailures(
  service: Pick<QualityGateService, 'output' | 'whenIdle'>,
  target: QualityGateTarget,
  runIds: readonly string[]
): Promise<QualityGateFeedbackFailure[] | 'inconclusive'> {
  await service.whenIdle(target.worktreeId)
  const failures: QualityGateFeedbackFailure[] = []
  for (const runId of runIds) {
    let output = await service.output(target, runId)
    // A gate somebody queued behind ours can still be live when the queue we waited on ends.
    while (qualityGateRunLiveness(output.run.status) === 'live') {
      await service.whenIdle(target.worktreeId)
      output = await service.output(target, runId)
    }
    if (output.run.status === 'failed' || output.run.status === 'timed-out') {
      failures.push(output)
    } else if (output.run.status !== 'passed') {
      return 'inconclusive'
    }
  }
  return failures
}
