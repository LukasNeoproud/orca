import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'
import type { PortableConversationProposalRecord } from '../../../../shared/portable-conversation-proposal'
import type { StructuredTaskProposal } from '../../../../shared/structured-task-proposal'
import type { PortableConversationSourceAnchor } from '../../../../shared/portable-conversation-source'

export function portableTaskProposalRecord(input: {
  proposal: StructuredTaskProposal
  proof: PortableConversationProposalRecord['portable']
  anchor: PortableConversationSourceAnchor
  previous?: PortableConversationProposalRecord | null
  related?: ReadonlyMap<string, PortableConversationSource>
}): PortableConversationProposalRecord {
  const prior = new Map(input.previous?.proposal.items.map((item) => [item.itemId, item]))
  const now = Date.now()
  return {
    schemaVersion: 1,
    proposal: {
      ...input.proposal,
      items: input.proposal.items.map((item) => {
        const saved = prior.get(item.itemId)
        const intent =
          item.action === 'attach'
            ? input.related?.get(item.targetSessionId ?? '')
              ? { kind: 'attach' as const, target: input.related.get(item.targetSessionId ?? '')! }
              : { kind: 'reject' as const }
            : item.action === 'reject'
              ? { kind: 'reject' as const }
              : saved?.intent.kind === 'prepare' && saved.intent.workspaceId === item.workspaceId
                ? saved.intent
                : {
                    kind: 'prepare' as const,
                    targetSessionId: `portable-${crypto.randomUUID()}`,
                    agent: input.proof.source.provider.agent,
                    workspaceId: item.workspaceId,
                    executionHostId: input.proof.source.executionHostId
                  }
        return { ...item, intent }
      })
    },
    portable: { ...input.proof, anchor: input.anchor },
    revision: input.previous ? input.previous.revision + 1 : 1,
    state: 'offered',
    results: input.previous?.results ?? [],
    createdAt: input.previous?.createdAt ?? now,
    updatedAt: now
  }
}
