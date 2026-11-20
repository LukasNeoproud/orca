import { z } from 'zod'
import { QUALITY_GATE_PROPOSAL_LIMITS } from '../quality-gate-proposal'
import { QUALITY_GATE_LIMITS } from '../quality-gate-types'
import { requiredString } from './rpc-param-primitives'

const GateId = z.string().min(1).max(64)
const RunId = z.string().min(1).max(128)

/**
 * The methods that run and read gates name a workspace and nothing else about what runs: the
 * commands come from the settings of the host that owns the workspace.
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
 * The one method that writes definitions: the gates and the loop of a repository the host keeps.
 * The host takes it only from an Orca app, never from the runtime socket. Both fields are read by
 * the host's own normalizers, so a field left out stays as it is on the host.
 */
export const QualityGateSetRepositorySettingsParams = z.object({
  repo: requiredString('Missing repo selector'),
  gates: z.array(z.unknown()).max(200).optional(),
  feedbackLoop: z.unknown().optional()
})

const ProposedGate = z.object({
  /** The gate of the repository this entry would change; left out, the entry is a gate to add. */
  gateId: GateId.optional(),
  name: z.string().trim().min(1).max(QUALITY_GATE_LIMITS.maxNameLength),
  command: z
    .string()
    .trim()
    .min(1)
    .max(QUALITY_GATE_LIMITS.maxCommandLength)
    .refine((value) => !value.includes('\0'), 'A gate command cannot contain a NUL character'),
  required: z.boolean().optional(),
  timeoutSeconds: z
    .number()
    .int()
    .min(QUALITY_GATE_LIMITS.minTimeoutSeconds)
    .max(QUALITY_GATE_LIMITS.maxTimeoutSeconds)
    .optional(),
  rationale: z.string().trim().max(QUALITY_GATE_PROPOSAL_LIMITS.maxItemRationaleLength).optional()
})

/**
 * What an agent or the CLI may send about definitions: a proposal the host only stores. It is
 * strict where the settings are lenient, so the sender learns what to correct.
 */
export const QualityGateProposeParams = QualityGateWorktreeParams.extend({
  gates: z.array(ProposedGate).min(1).max(QUALITY_GATE_PROPOSAL_LIMITS.maxItems),
  rationale: z.string().trim().max(QUALITY_GATE_PROPOSAL_LIMITS.maxRationaleLength).optional()
})

/** Reads the pending proposal of a repository the host keeps. */
export const QualityGateProposalParams = z.object({
  repo: requiredString('Missing repo selector')
})

/**
 * The user's answer to a proposal, taken only from an Orca app. `proposalId` is the proposal the
 * user saw; `itemIds` left out answers every item still pending.
 */
export const QualityGateResolveProposalParams = QualityGateProposalParams.extend({
  proposalId: z.string().min(1).max(128),
  action: z.enum(['accept', 'dismiss']),
  itemIds: z.array(GateId).min(1).max(QUALITY_GATE_PROPOSAL_LIMITS.maxItems).optional()
})
