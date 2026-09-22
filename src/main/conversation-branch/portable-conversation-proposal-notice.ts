import type {
  PortableConversationProposalNotice,
  PortableConversationProposalNoticeBeginParams,
  PortableConversationProposalNoticeBeginResult,
  PortableConversationProposalNoticeCompleteParams,
  PortableConversationProposalRecord
} from '../../shared/portable-conversation-proposal'
import type { PortableConversationProposalStore } from './portable-conversation-proposal-store'
import { portableConversationContentHash } from './portable-conversation-branch-service'

export async function preparePortableConversationProposalNotice(
  store: PortableConversationProposalStore,
  record: PortableConversationProposalRecord,
  now = Date.now()
): Promise<void> {
  const successful = record.results.filter(
    (result) => result.status === 'prepared' || result.status === 'attached'
  )
  const notified = new Set(
    store.notices(record.proposal.proposalId).flatMap((notice) => notice.branchIds)
  )
  const pendingNotice = successful.filter((result) => !notified.has(result.branchId))
  if (pendingNotice.length === 0) {
    return
  }
  const branchIds = pendingNotice.map((result) => result.branchId).sort()
  const digest = portableConversationContentHash(branchIds.join('\0')).slice(0, 16)
  const noticeId = `${record.proposal.proposalId}-source-notice-${digest}`
  const items = pendingNotice.flatMap((result) => {
    const item = record.proposal.items.find((candidate) => candidate.itemId === result.itemId)
    return item ? [`- **${item.name}**: ${item.scope}`] : []
  })
  const content = [
    'Orca associated these scopes with related conversations:',
    '',
    ...items,
    '',
    'The related conversations are prepared; no agent was started automatically.'
  ].join('\n')
  await store.putNotice({
    schemaVersion: 1,
    noticeId,
    proposalId: record.proposal.proposalId,
    source: record.portable.source,
    branchIds,
    content,
    contentSha256: portableConversationContentHash(content),
    delivery: null,
    attemptId: null,
    createdAt: now,
    updatedAt: now
  })
}

export async function beginPortableConversationProposalNotice(
  store: PortableConversationProposalStore,
  params: PortableConversationProposalNoticeBeginParams,
  now = Date.now()
): Promise<PortableConversationProposalNoticeBeginResult> {
  return store.runExclusive(`notice:${params.noticeId}`, async () => {
    const notice = requireNotice(store, params.noticeId)
    const delivery = notice.delivery
    if (delivery?.status === 'accepted') {
      if (delivery.clientMessageId !== params.attemptId) {
        throw new Error('portable_conversation_proposal_notice_already_sent')
      }
      return { notice, authorized: false }
    }
    if (delivery?.status === 'pending' || delivery?.status === 'unknown') {
      if (delivery.clientMessageId !== params.attemptId) {
        throw new Error('portable_conversation_proposal_notice_in_flight')
      }
      return { notice, authorized: false }
    }
    const pending: PortableConversationProposalNotice = {
      ...notice,
      delivery: {
        clientMessageId: params.attemptId,
        status: 'pending',
        reason: null,
        submittedAt: now,
        resolvedAt: null
      },
      attemptId: params.attemptId,
      updatedAt: now
    }
    return { notice: await store.putNotice(pending), authorized: true }
  })
}

export async function completePortableConversationProposalNotice(
  store: PortableConversationProposalStore,
  params: PortableConversationProposalNoticeCompleteParams,
  now = Date.now()
): Promise<PortableConversationProposalNotice> {
  return store.runExclusive(`notice:${params.noticeId}`, async () => {
    const notice = requireNotice(store, params.noticeId)
    if (
      notice.attemptId !== params.attemptId ||
      notice.delivery?.clientMessageId !== params.attemptId
    ) {
      throw new Error('portable_conversation_proposal_notice_attempt_mismatch')
    }
    if (notice.delivery.status !== 'pending') {
      return notice
    }
    return store.putNotice({
      ...notice,
      delivery: {
        ...notice.delivery,
        status: params.status,
        reason: params.reason ?? null,
        resolvedAt: now
      },
      updatedAt: now
    })
  })
}

function requireNotice(
  store: PortableConversationProposalStore,
  noticeId: string
): PortableConversationProposalNotice {
  const notice = store.getNotice(noticeId)
  if (!notice) {
    throw new Error('portable_conversation_proposal_notice_missing')
  }
  return notice
}
