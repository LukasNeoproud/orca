import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  PortableConversationProposalRecord,
  PortableConversationProposalNotice
} from '../../../shared/portable-conversation-proposal'
import type { PortableConversationSource } from '../../../shared/portable-conversation-source'
import type {
  StructuredTaskProposalBatchRequest,
  StructuredTaskProposalBatchResult
} from '../../../shared/structured-task-proposal'
import { portableTaskProposalRecord } from '@/components/native-chat/portable-task-proposal-record'
import { portableProposalClient } from './portable-conversation-proposal-client'
import { sendPortableConversationProposalNotice } from './portable-conversation-proposal-notice-send'

export type PortableTaskProposalBatchIntent = {
  draft: PortableConversationProposalRecord
  expectedRevision: number
}

function sameItems(
  record: PortableConversationProposalRecord,
  request: StructuredTaskProposalBatchRequest
): boolean {
  return request.items.every((item) => {
    const saved = record.proposal.items.find((entry) => entry.itemId === item.itemId)
    const keys = [
      'itemId',
      'branchId',
      'name',
      'scope',
      'verification',
      'dependencyIds',
      'workspaceId',
      'context',
      'relationKind',
      'action',
      'targetSessionId'
    ] as const
    return saved && keys.every((key) => JSON.stringify(saved[key]) === JSON.stringify(item[key]))
  })
}

export async function preparePortableTaskProposalBatch(args: {
  target: RuntimeClientTarget
  record: PortableConversationProposalRecord
  request: StructuredTaskProposalBatchRequest
  related: ReadonlyMap<string, PortableConversationSource>
  intent: { current: PortableTaskProposalBatchIntent | null }
  onRecord: (record: PortableConversationProposalRecord) => void
}): Promise<StructuredTaskProposalBatchResult> {
  if (args.record.proposal.proposalId !== args.request.proposalId) {
    throw new Error('portable_conversation_proposal_intent_mismatch')
  }
  let record = args.record
  if (record.state !== 'confirmed') {
    if (!args.intent.current) {
      const previous = new Map(record.proposal.items.map((item) => [item.itemId, item]))
      const proposal = {
        ...record.proposal,
        items: args.request.items.map((item) => ({
          ...item,
          uncertain: previous.get(item.itemId)?.uncertain ?? false
        }))
      }
      args.intent.current = {
        draft: portableTaskProposalRecord({
          proposal,
          proof: record.portable,
          anchor: record.portable.anchor,
          previous: record,
          related: args.related
        }),
        expectedRevision: record.revision
      }
    }
    const intent = args.intent.current
    if (!sameItems(intent.draft, args.request)) {
      throw new Error('portable_conversation_proposal_immutable')
    }
    try {
      record = (
        await portableProposalClient.put(args.target, {
          proposal: intent.draft,
          expectedRevision: intent.expectedRevision
        })
      ).proposal
    } catch (failure) {
      const observed = (
        await portableProposalClient.get(
          args.target,
          record.portable.source,
          intent.draft.proposal.proposalId
        )
      ).proposal
      if (
        !observed ||
        JSON.stringify(observed.proposal) !== JSON.stringify(intent.draft.proposal)
      ) {
        throw failure
      }
      record = observed
    }
    args.onRecord(record)
  } else if (!sameItems(record, args.request)) {
    throw new Error('portable_conversation_proposal_immutable')
  }
  const confirmed = await portableProposalClient.confirm(args.target, {
    proposalId: record.proposal.proposalId,
    expectedRevision: record.revision,
    itemIds: args.request.items.map((item) => item.itemId)
  })
  args.onRecord(confirmed.proposal)
  try {
    const { notices } = await portableProposalClient.notices(
      args.target,
      record.proposal.proposalId
    )
    const outcomes: PortableConversationProposalNotice[] = []
    for (const notice of notices) {
      outcomes.push(
        !notice.delivery || notice.delivery.status === 'rejected'
          ? await sendPortableConversationProposalNotice(args.target, notice)
          : notice
      )
    }
    const latest =
      outcomes.find((notice) => notice.delivery?.status === 'rejected') ??
      outcomes.find((notice) => notice.delivery?.status !== 'accepted') ??
      outcomes.at(-1)
    return {
      ...confirmed.batch,
      ...(latest
        ? {
            sourceNotice: {
              status:
                latest.delivery?.status === 'accepted'
                  ? 'accepted'
                  : latest.delivery?.status === 'rejected'
                    ? 'rejected'
                    : 'unknown',
              ...(latest.delivery?.reason ? { message: latest.delivery.reason } : {})
            } as NonNullable<StructuredTaskProposalBatchResult['sourceNotice']>
          }
        : {})
    }
  } catch (failure) {
    return {
      ...confirmed.batch,
      sourceNotice: {
        status: 'unknown',
        message: failure instanceof Error ? failure.message : String(failure)
      }
    }
  }
}
