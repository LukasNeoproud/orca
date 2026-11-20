import {
  applyQualityGateProposalItems,
  type QualityGateProposal,
  type QualityGateProposalItem
} from '../../../../shared/quality-gate-proposal'
import type { QualityGateDefinition } from '../../../../shared/quality-gate-types'
import type { QualityGateDraft } from './quality-gate-settings-draft'

export type QualityGateProposalField = 'name' | 'command' | 'required' | 'timeoutSeconds'

export type QualityGateProposalConflict = 'duplicate-name' | 'too-many'

export type QualityGateProposalEntry = {
  item: QualityGateProposalItem
  /** The gate the item would replace; null for a gate to add. */
  current: QualityGateDefinition | null
  /** Fields that differ from `current`; empty for a gate to add. */
  changed: QualityGateProposalField[]
  /** The item names a gate the repository no longer has, so accepting adds it at the end. */
  targetGone: boolean
  /** Why the host would refuse accepting this item alone against the gates as they are. */
  conflict: QualityGateProposalConflict | null
}

export type QualityGateProposalPresentation = {
  entries: QualityGateProposalEntry[]
  /** Why accepting every item at once would be refused. */
  conflict: QualityGateProposalConflict | null
}

const FIELDS: readonly QualityGateProposalField[] = [
  'name',
  'command',
  'required',
  'timeoutSeconds'
]

function conflictOf(
  gates: readonly QualityGateDefinition[],
  items: readonly QualityGateProposalItem[]
): QualityGateProposalConflict | null {
  const application = applyQualityGateProposalItems(gates, items)
  return application.ok ? null : application.reason
}

/**
 * The proposal as a difference against the gates in force, read with the host's own rule of what
 * accepting writes, so the screen never promises a result the host would not produce.
 */
export function presentQualityGateProposal(
  gates: readonly QualityGateDefinition[],
  proposal: QualityGateProposal
): QualityGateProposalPresentation {
  const entries = proposal.items.map((item): QualityGateProposalEntry => {
    const current = item.gateId ? (gates.find((gate) => gate.id === item.gateId) ?? null) : null
    return {
      item,
      current,
      changed: current ? FIELDS.filter((field) => current[field] !== item[field]) : [],
      targetGone: Boolean(item.gateId) && current === null,
      conflict: conflictOf(gates, [item])
    }
  })
  return { entries, conflict: conflictOf(gates, proposal.items) }
}

/** The form for an item the user edits before taking it: it saves where accepting would. */
export function draftFromQualityGateProposalItem(
  entry: QualityGateProposalEntry
): QualityGateDraft {
  return {
    id: entry.current?.id ?? null,
    name: entry.item.name,
    command: entry.item.command,
    required: entry.item.required,
    timeoutSeconds: String(entry.item.timeoutSeconds)
  }
}
