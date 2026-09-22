export const STRUCTURED_TASK_PROPOSAL_LIMITS = {
  sourceCharacters: 12_000,
  sourcePassages: 24,
  proposalItems: 6,
  itemCharacters: 4_000
} as const

export type StructuredTaskProposalSourceKind = 'prompt' | 'review'

export type StructuredTaskProposalAnchor = {
  epoch: string
  itemId: string
}

export type StructuredTaskProposalPassage = {
  itemId: string
  text: string
}

export type StructuredTaskProposalSource = {
  sessionId: string
  workspaceId: string
  kind: StructuredTaskProposalSourceKind
  anchor: StructuredTaskProposalAnchor
  passages: StructuredTaskProposalPassage[]
}

export type StructuredTaskProposalContext = {
  content: string
  sourceItemIds: string[]
}

export type StructuredTaskProposalItemAction = 'prepare' | 'attach' | 'reject'

export type StructuredTaskProposalItem = {
  itemId: string
  branchId: string
  name: string
  scope: string
  verification: string
  dependencyIds: string[]
  workspaceId: string
  context: StructuredTaskProposalContext
  relationKind: 'subtask'
  action: StructuredTaskProposalItemAction
  targetSessionId?: string
  uncertain: boolean
}

export type StructuredTaskProposal = {
  proposalId: string
  source: StructuredTaskProposalSource
  items: StructuredTaskProposalItem[]
  shouldOffer: boolean
  analysis: 'deterministic' | 'provider'
  truncated: boolean
}

export type StructuredTaskProposalCandidate = {
  name: string
  scope: string
  verification?: string
  dependencyIndexes?: number[]
  workspaceId?: string
  context?: string
  sourceItemIds?: string[]
  uncertain?: boolean
}

export type StructuredTaskProposalPrepareItem = Pick<
  StructuredTaskProposalItem,
  | 'itemId'
  | 'branchId'
  | 'name'
  | 'scope'
  | 'verification'
  | 'dependencyIds'
  | 'workspaceId'
  | 'context'
  | 'relationKind'
  | 'action'
  | 'targetSessionId'
>

export type StructuredTaskProposalBatchRequest = {
  proposalId: string
  source: StructuredTaskProposalSource
  items: StructuredTaskProposalPrepareItem[]
}

export type StructuredTaskProposalItemResult = {
  itemId: string
  branchId: string
  status: 'prepared' | 'attached' | 'failed' | 'unknown'
  targetSessionId?: string
  message?: string
}

export type StructuredTaskProposalBatchResult = {
  items: StructuredTaskProposalItemResult[]
  sourceNotice?: {
    status: 'accepted' | 'rejected' | 'unknown'
    message?: string
  }
}

export type StructuredTaskProposalWorkspace = {
  workspaceId: string
  name: string
  detail?: string
}

export type StructuredTaskProposalRelatedThread = {
  sessionId: string
  title: string
  workspaceId: string
  detail?: string
}

export function stableStructuredTaskProposalId(parts: readonly string[]): string {
  let hash = 0x811c9dc5
  for (const character of parts.join('\u0000')) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

export function structuredTaskProposalBranchId(proposalId: string, itemId: string): string {
  return `proposal-${proposalId}-${itemId}`
}

export function formatStructuredTaskProposalHandoff(item: {
  name: string
  scope: string
  verification: string
  context: { content: string }
}): string {
  return [
    `# ${item.name}`,
    '',
    '## Scope',
    item.scope,
    '',
    '## Expected verification',
    item.verification,
    '',
    '## Targeted context',
    item.context.content
  ].join('\n')
}
