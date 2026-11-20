import type { QualityGateProposalResult } from '../shared/quality-gate-proposal'

/** What `orca gates propose` prints: the proposal as the host stored it, and that it is pending. */
export function formatQualityGateProposal(result: QualityGateProposalResult): string {
  const proposal = result.proposal
  if (!proposal) {
    return 'No proposal is pending for this repository.'
  }
  const lines = proposal.items.map((item) =>
    [
      item.gateId ? `change ${item.gateId}` : 'add',
      item.name,
      item.required ? 'required' : 'optional',
      `${item.timeoutSeconds}s`,
      item.command
    ].join('\t')
  )
  return [
    `Proposed ${proposal.items.length} quality gate(s). Nothing changed yet and nothing runs from a proposal:`,
    ...lines,
    'The user accepts or dismisses the proposal in the repository settings of the Orca app. Until then the gates in orca gates list stay in force.'
  ].join('\n')
}
