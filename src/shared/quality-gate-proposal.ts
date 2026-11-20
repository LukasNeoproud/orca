/**
 * A proposal of quality gates: what an agent suggests for a repository. It is data until the user
 * accepts it in the Orca app; nothing runs from it and the gates of the repository stay as they are.
 */

import { qualityGateIdFromName } from './quality-gate-id'
import {
  normalizeQualityGateDefinitions,
  QUALITY_GATE_ID_PATTERN,
  QUALITY_GATE_LIMITS,
  type QualityGateDefinition
} from './quality-gate-types'

export const QUALITY_GATE_PROPOSAL_LIMITS = {
  maxItems: QUALITY_GATE_LIMITS.maxGates,
  maxRationaleLength: 1000,
  maxItemRationaleLength: 500
} as const

export type QualityGateProposalItem = Omit<QualityGateDefinition, 'id'> & {
  /** Names the item inside its proposal; given by the host. */
  id: string
  /** The gate of the repository this item would change. Absent for a gate to add. */
  gateId?: string
  rationale?: string
}

export type QualityGateProposal = {
  /** New with every proposal, so an answer names exactly the text the user saw. */
  id: string
  repoId: string
  /** The workspace the proposal was sent from. */
  worktreeId: string
  proposedAt: number
  /** Who sent it, as the host's transport established it (`local-cli` for an agent or the CLI). */
  proposedBy: { kind: string; deviceId?: string }
  rationale?: string
  items: QualityGateProposalItem[]
}

/** The answer of `qualityGates.propose` and `qualityGates.proposal`. */
export type QualityGateProposalResult = { proposal: QualityGateProposal | null }

export type QualityGateProposalAction = 'accept' | 'dismiss'

/** The answer of `qualityGates.resolveProposal`: what is still pending and the gates in force. */
export type QualityGateResolveProposalResult = {
  proposal: QualityGateProposal | null
  gates: QualityGateDefinition[]
}

type Unchecked<T> = { [K in keyof T]?: unknown }

function optionalText(value: unknown, maxLength: number): string | undefined {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
  return text || undefined
}

function readItem(value: unknown): QualityGateProposalItem | null {
  // The item's own fields have the bounds of a gate, so the reader of gates checks them.
  const gate = normalizeQualityGateDefinitions([value])?.[0]
  if (!gate || !value || typeof value !== 'object') {
    return null
  }
  const unchecked: Unchecked<QualityGateProposalItem> = value
  const gateId =
    typeof unchecked.gateId === 'string' && QUALITY_GATE_ID_PATTERN.test(unchecked.gateId)
      ? unchecked.gateId
      : undefined
  const rationale = optionalText(
    unchecked.rationale,
    QUALITY_GATE_PROPOSAL_LIMITS.maxItemRationaleLength
  )
  return { ...gate, ...(gateId ? { gateId } : {}), ...(rationale ? { rationale } : {}) }
}

/**
 * A proposal read from a file or from a host of another build: null when it is not one, a
 * malformed item dropped, unknown fields left out. A proposal left with no item is no proposal.
 */
export function readQualityGateProposal(value: unknown): QualityGateProposal | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const unchecked: Unchecked<QualityGateProposal> = value
  const { id, repoId, worktreeId, proposedAt } = unchecked
  if (typeof id !== 'string' || !id || typeof repoId !== 'string' || !repoId) {
    return null
  }
  const items: QualityGateProposalItem[] = []
  const seen = new Set<string>()
  for (const entry of Array.isArray(unchecked.items) ? unchecked.items : []) {
    const item = readItem(entry)
    if (item && !seen.has(item.id) && items.length < QUALITY_GATE_PROPOSAL_LIMITS.maxItems) {
      seen.add(item.id)
      items.push(item)
    }
  }
  if (items.length === 0) {
    return null
  }
  const by: Unchecked<QualityGateProposal['proposedBy']> =
    unchecked.proposedBy && typeof unchecked.proposedBy === 'object' ? unchecked.proposedBy : {}
  const rationale = optionalText(
    unchecked.rationale,
    QUALITY_GATE_PROPOSAL_LIMITS.maxRationaleLength
  )
  return {
    id,
    repoId,
    worktreeId: typeof worktreeId === 'string' ? worktreeId : '',
    proposedAt: typeof proposedAt === 'number' && Number.isFinite(proposedAt) ? proposedAt : 0,
    proposedBy: {
      kind: typeof by.kind === 'string' ? by.kind : 'unknown',
      ...(typeof by.deviceId === 'string' ? { deviceId: by.deviceId } : {})
    },
    ...(rationale ? { rationale } : {}),
    items
  }
}

/** The proposal inside an answer of `qualityGates.propose`, `proposal` or `resolveProposal`. */
export function readQualityGateProposalResult(value: unknown): QualityGateProposal | null {
  return value && typeof value === 'object' && 'proposal' in value
    ? readQualityGateProposal(value.proposal)
    : null
}

export type QualityGateProposalApplication =
  | { ok: true; gates: QualityGateDefinition[] }
  | { ok: false; reason: 'duplicate-name'; name: string }
  | { ok: false; reason: 'too-many' }

/**
 * The gates of a repository with the given items accepted: an item that names a gate still there
 * takes its place and keeps its id, any other is added at the end. The host writes exactly this;
 * a client can call it to show what accepting would change.
 */
export function applyQualityGateProposalItems(
  gates: readonly QualityGateDefinition[],
  items: readonly QualityGateProposalItem[]
): QualityGateProposalApplication {
  const next = [...gates]
  for (const item of items) {
    const index = item.gateId ? next.findIndex((gate) => gate.id === item.gateId) : -1
    const name = item.name.toLowerCase()
    if (next.some((gate, at) => at !== index && gate.name.toLowerCase() === name)) {
      return { ok: false, reason: 'duplicate-name', name: item.name }
    }
    const gate: QualityGateDefinition = {
      id:
        index >= 0
          ? next[index].id
          : qualityGateIdFromName(item.name, new Set(next.map((existing) => existing.id))),
      name: item.name,
      command: item.command,
      required: item.required,
      timeoutSeconds: item.timeoutSeconds
    }
    if (index >= 0) {
      next[index] = gate
    } else {
      next.push(gate)
    }
  }
  return next.length > QUALITY_GATE_LIMITS.maxGates
    ? { ok: false, reason: 'too-many' }
    : { ok: true, gates: next }
}
