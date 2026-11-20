import { z } from 'zod'
import { QUALITY_GATE_LIMITS } from '../quality-gate-types'
import { requiredString } from './rpc-param-primitives'

const GateId = z.string().min(1).max(64)
const RunId = z.string().min(1).max(128)

/**
 * Every method but the last names a workspace and nothing else about what runs: the commands come
 * from the settings of the host that owns the workspace.
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

/**
 * `cadence: 'background'` asks for the tree to be watched at the slow interval; runs are signalled
 * at once either way. Any other value reads as the default, so a newer client's word is no error.
 */
export const QualityGateSubscribeParams = QualityGateWorktreeParams.extend({
  cadence: z.string().max(32).optional()
})

/** Ends a `qualityGates.subscribe` stream; the id comes from that stream's `ready` frame. */
export const QualityGateUnsubscribeParams = z.object({
  subscriptionId: z.string().min(1).max(128)
})

/**
 * The workspace's own switch of the feedback loop. It cannot turn the loop on for a repository:
 * that setting is written by the app's own window, like the gates.
 */
export const QualityGateSetFeedbackLoopParams = QualityGateWorktreeParams.extend({
  enabled: z.boolean()
})

/**
 * The one method that carries definitions: the gates and the loop of a repository the host keeps.
 * The host takes it only from an Orca app, never from the runtime socket. Both fields are read by
 * the host's own normalizers, so a field left out stays as it is on the host.
 */
export const QualityGateSetRepositorySettingsParams = z.object({
  repo: requiredString('Missing repo selector'),
  gates: z.array(z.unknown()).max(200).optional(),
  feedbackLoop: z.unknown().optional()
})
