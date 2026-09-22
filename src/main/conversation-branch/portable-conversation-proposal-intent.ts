import { portableConversationSourceSessionId } from '../../shared/portable-conversation-branch'
import type { PortableConversationProposalRecord } from '../../shared/portable-conversation-proposal'

export function validatePortableConversationProposalIntents(
  record: PortableConversationProposalRecord
): void {
  const itemIds = new Set<string>()
  const branchIds = new Set<string>()
  for (const item of record.proposal.items) {
    if (itemIds.has(item.itemId) || branchIds.has(item.branchId)) {
      throw new Error('portable_conversation_proposal_intent_mismatch')
    }
    itemIds.add(item.itemId)
    branchIds.add(item.branchId)
    const intentMatches =
      item.intent.kind === 'prepare'
        ? item.action === 'prepare' &&
          item.workspaceId === item.intent.workspaceId &&
          item.targetSessionId === item.intent.targetSessionId
        : item.intent.kind === 'attach'
          ? item.action === 'attach' &&
            item.workspaceId === item.intent.target.workspace.id &&
            item.targetSessionId === portableConversationSourceSessionId(item.intent.target)
          : item.action === 'reject'
    if (
      !intentMatches ||
      item.context.sourceItemIds.some((sourceItemId) =>
        record.proposal.source.passages.every((passage) => passage.itemId !== sourceItemId)
      )
    ) {
      throw new Error('portable_conversation_proposal_intent_mismatch')
    }
  }
  if (
    record.proposal.items.some((item) =>
      item.dependencyIds.some(
        (dependencyId) => dependencyId === item.itemId || !itemIds.has(dependencyId)
      )
    )
  ) {
    throw new Error('portable_conversation_proposal_intent_mismatch')
  }
}
