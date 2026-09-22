import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  PortableConversationProposalNotice,
  PortableConversationProposalNoticeBeginResult
} from '../../../shared/portable-conversation-proposal'
import { callPortableConversation } from './portable-conversation-source-client'
import { deliverPortableConversationText } from './portable-conversation-text-delivery'

export async function sendPortableConversationProposalNotice(
  target: RuntimeClientTarget,
  notice: PortableConversationProposalNotice
): Promise<PortableConversationProposalNotice> {
  const attemptId = notice.attemptId ?? notice.noticeId
  const claim = await callPortableConversation<PortableConversationProposalNoticeBeginResult>(
    target,
    'portableConversation.proposalNoticeBegin',
    { noticeId: notice.noticeId, attemptId }
  )
  if (!claim.authorized) {
    return claim.notice
  }
  const outcome = await deliverPortableConversationText(
    target,
    claim.notice.source,
    claim.notice.content
  )
  const completed = await callPortableConversation<{ notice: PortableConversationProposalNotice }>(
    target,
    'portableConversation.proposalNoticeComplete',
    {
      noticeId: claim.notice.noticeId,
      attemptId,
      ...outcome
    }
  )
  return completed.notice
}
