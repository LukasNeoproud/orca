import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import {
  applyQualityGateProposalItems,
  type QualityGateProposal,
  type QualityGateProposalApplication,
  type QualityGateProposalItem,
  type QualityGateProposalResult,
  type QualityGateResolveProposalResult
} from '../../shared/quality-gate-proposal'
import {
  normalizeQualityGateDefinitions,
  QUALITY_GATE_LIMITS,
  type QualityGateDefinition
} from '../../shared/quality-gate-types'
import type {
  QualityGateProposeParams,
  QualityGateResolveProposalParams
} from '../../shared/rpc-contract/quality-gate-params'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { RpcCallerIdentity } from '../runtime/rpc/rpc-caller-identity'
import {
  createQualityGateProposalStore,
  defaultQualityGateProposalStorePath,
  type QualityGateProposalStore
} from './quality-gate-proposal-store'
import {
  assertQualityGateRepositorySettingsCaller,
  showQualityGateRepositoryOfThisHost,
  writeQualityGateRepositorySettings
} from './quality-gate-repository-settings'
import { resolveQualityGateTarget } from './quality-gate-target'

type ProposeRuntime = Parameters<typeof resolveQualityGateTarget>[0]
type ResolveRuntime = Pick<OrcaRuntimeService, 'showRepo' | 'updateRepo'>

let store: QualityGateProposalStore | null = null

export function getQualityGateProposalStore(): QualityGateProposalStore {
  store ??= createQualityGateProposalStore({ filePath: defaultQualityGateProposalStorePath() })
  return store
}

/** @internal - tests install a store over a temp file. */
export function _setQualityGateProposalStoreForTests(next: QualityGateProposalStore | null): void {
  store = next
}

function applicationError(
  application: Exclude<QualityGateProposalApplication, { ok: true }>
): Error {
  return new Error(
    application.reason === 'duplicate-name'
      ? `A quality gate named "${application.name}" already exists. Name the gate to change with gateId, or pick another name.`
      : `A repository holds at most ${QUALITY_GATE_LIMITS.maxGates} quality gates.`
  )
}

/**
 * Stores what an agent or the CLI proposes for the repository of a workspace, in place of the
 * proposal that repository had. It writes no gate and starts nothing: the gates in force are the
 * ones in the repository row, which only the user's answer in an Orca app changes.
 */
export async function proposeQualityGates(
  runtime: ProposeRuntime,
  caller: RpcCallerIdentity | undefined,
  params: z.infer<typeof QualityGateProposeParams>
): Promise<QualityGateProposalResult> {
  if (!caller) {
    throw new Error('Quality gates can only be proposed by a caller this host can identify.')
  }
  const target = await resolveQualityGateTarget(runtime, params.worktree)
  if (!target.repoId) {
    throw new Error(
      'This workspace has no repository settings, so there is nowhere to propose quality gates.'
    )
  }
  const items: QualityGateProposalItem[] = params.gates.map((gate, index) => ({
    id: `item-${index + 1}`,
    ...(gate.gateId ? { gateId: gate.gateId } : {}),
    name: gate.name,
    command: gate.command,
    required: gate.required ?? true,
    timeoutSeconds: gate.timeoutSeconds ?? QUALITY_GATE_LIMITS.defaultTimeoutSeconds,
    ...(gate.rationale ? { rationale: gate.rationale } : {})
  }))
  const changed = new Set<string>()
  for (const item of items) {
    if (!item.gateId) {
      continue
    }
    if (!target.gates.some((gate) => gate.id === item.gateId)) {
      throw new Error(
        `No quality gate "${item.gateId}" is set up for this repository. Leave gateId out to propose a new gate.`
      )
    }
    if (changed.has(item.gateId)) {
      throw new Error(`The proposal changes the quality gate "${item.gateId}" more than once.`)
    }
    changed.add(item.gateId)
  }
  // Checked as a whole now, so the agent corrects it; the answer checks again against the gates
  // of that moment.
  const application = applyQualityGateProposalItems(target.gates, items)
  if (!application.ok && application.reason === 'duplicate-name') {
    throw applicationError(application)
  }
  const proposal: QualityGateProposal = {
    id: randomUUID(),
    repoId: target.repoId,
    worktreeId: target.worktreeId,
    proposedAt: Date.now(),
    proposedBy:
      caller.kind === 'paired-device'
        ? { kind: caller.kind, deviceId: caller.deviceId }
        : { kind: caller.kind },
    ...(params.rationale ? { rationale: params.rationale } : {}),
    items
  }
  getQualityGateProposalStore().put(proposal)
  console.info(
    `[quality-gates] ${items.length} gate(s) proposed for repository ${target.repoId} by ${caller.kind}`
  )
  return { proposal }
}

export async function readPendingQualityGateProposal(
  runtime: Pick<OrcaRuntimeService, 'showRepo'>,
  params: { repo: string }
): Promise<QualityGateProposalResult> {
  const repo = await showQualityGateRepositoryOfThisHost(runtime, params.repo)
  return { proposal: getQualityGateProposalStore().get(repo.id) }
}

/**
 * The user's answer: accepted items become gates through the same caller check and the same write
 * as the repository settings, dismissed ones are dropped. Items not named stay pending.
 */
export async function resolveQualityGateProposal(
  runtime: ResolveRuntime,
  caller: RpcCallerIdentity | undefined,
  params: z.infer<typeof QualityGateResolveProposalParams>
): Promise<QualityGateResolveProposalResult> {
  assertQualityGateRepositorySettingsCaller(caller)
  const repo = await showQualityGateRepositoryOfThisHost(runtime, params.repo)
  const proposals = getQualityGateProposalStore()
  const proposal = proposals.get(repo.id)
  // An answer to a proposal that was replaced meanwhile would accept text the user never saw.
  if (!proposal || proposal.id !== params.proposalId) {
    throw new Error(
      'This proposal is no longer pending. Read the proposal of the repository again.'
    )
  }
  const answered = new Set(params.itemIds ?? proposal.items.map((item) => item.id))
  const unknown = [...answered].find((id) => !proposal.items.some((item) => item.id === id))
  if (unknown) {
    throw new Error(`The proposal has no pending item "${unknown}".`)
  }
  let gates: QualityGateDefinition[] = normalizeQualityGateDefinitions(repo.qualityGates) ?? []
  if (params.action === 'accept') {
    const application = applyQualityGateProposalItems(
      gates,
      proposal.items.filter((item) => answered.has(item.id))
    )
    if (!application.ok) {
      throw applicationError(application)
    }
    const written = await writeQualityGateRepositorySettings(runtime, caller, {
      repo: params.repo,
      gates: application.gates
    })
    gates = written.gates
  }
  const pending = proposal.items.filter((item) => !answered.has(item.id))
  const remaining = pending.length > 0 ? { ...proposal, items: pending } : null
  // A proposal that arrived during the write stays: it is the newer one.
  if (proposals.get(repo.id)?.id === proposal.id) {
    if (remaining) {
      proposals.put(remaining)
    } else {
      proposals.remove(repo.id)
    }
  }
  return { proposal: proposals.get(repo.id), gates }
}
