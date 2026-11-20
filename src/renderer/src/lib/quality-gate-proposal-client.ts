import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { QUALITY_GATES_PROPOSALS_RUNTIME_CAPABILITY } from '../../../shared/host-feature-runtime-capabilities'
import {
  readQualityGateProposalResult,
  type QualityGateProposal,
  type QualityGateProposalAction
} from '../../../shared/quality-gate-proposal'
import {
  normalizeQualityGateDefinitions,
  type QualityGateDefinition
} from '../../../shared/quality-gate-types'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

const CALL_TIMEOUT_MS = 30_000
const CAPABILITY_TIMEOUT_MS = 15_000

/** Whether the host keeps proposals of gates. An older host does not, and is never asked. */
export async function qualityGateProposalsSupported(target: RuntimeClientTarget): Promise<boolean> {
  if (target.kind === 'local') {
    return true
  }
  return runtimeEnvironmentSupportsCapability(
    target.environmentId,
    QUALITY_GATES_PROPOSALS_RUNTIME_CAPABILITY,
    CAPABILITY_TIMEOUT_MS
  )
}

/** The proposal pending for a repository on the host that keeps it, or null. */
export async function fetchQualityGateProposal(
  target: RuntimeClientTarget,
  repoId: string
): Promise<QualityGateProposal | null> {
  return readQualityGateProposalResult(
    await callRuntimeRpc<unknown>(
      target,
      'qualityGates.proposal',
      { repo: `id:${repoId}` },
      { timeoutMs: CALL_TIMEOUT_MS }
    )
  )
}

export type QualityGateProposalAnswer = {
  proposalId: string
  action: QualityGateProposalAction
  /** Absent: every item still pending. */
  itemIds?: string[]
}

/**
 * The user's answer to a proposal, sent from the settings window only. Returns what is still
 * pending and the gates the host holds afterwards.
 */
export async function answerQualityGateProposal(
  target: RuntimeClientTarget,
  repoId: string,
  answer: QualityGateProposalAnswer
): Promise<{ proposal: QualityGateProposal | null; gates: QualityGateDefinition[] }> {
  const result = await callRuntimeRpc<unknown>(
    target,
    'qualityGates.resolveProposal',
    { repo: `id:${repoId}`, ...answer },
    { timeoutMs: CALL_TIMEOUT_MS }
  )
  const gates =
    result && typeof result === 'object' && 'gates' in result
      ? normalizeQualityGateDefinitions(result.gates)
      : undefined
  if (!gates) {
    throw new Error('The host did not confirm the quality gates it holds.')
  }
  return { proposal: readQualityGateProposalResult(result), gates }
}
