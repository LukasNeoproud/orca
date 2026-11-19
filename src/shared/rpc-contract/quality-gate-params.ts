import { z } from 'zod'
import { QUALITY_GATE_LIMITS } from '../quality-gate-types'
import { requiredString } from './rpc-param-primitives'

const GateId = z.string().min(1).max(64)
const RunId = z.string().min(1).max(128)

/**
 * Every method names a workspace and nothing else about what runs: the commands come from the
 * settings of the host that owns the workspace. No method here takes a command or a definition.
 */
export const QualityGateWorktreeParams = z.object({
  worktree: requiredString('Missing worktree selector')
})

export const QualityGateRunParams = QualityGateWorktreeParams.extend({
  /** Omitted runs every gate of the repository, in the order of its settings. */
  gateIds: z.array(GateId).min(1).max(QUALITY_GATE_LIMITS.maxGates).optional()
})

export const QualityGateOutputParams = QualityGateWorktreeParams.extend({ runId: RunId })

export const QualityGateCancelParams = QualityGateWorktreeParams.extend({
  runId: RunId.optional(),
  gateId: GateId.optional()
})
