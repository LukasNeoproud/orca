import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  PortableConversationBranchRecord,
  PortableConversationReturnArtifact
} from '../../../shared/portable-conversation-branch'
import {
  branchResultBeginPortableConversation,
  branchResultCompletePortableConversation
} from './portable-conversation-branch-client'
import { deliverPortableConversationText } from './portable-conversation-text-delivery'

export async function sendPortableConversationResult(
  target: RuntimeClientTarget,
  branch: PortableConversationBranchRecord,
  artifact: PortableConversationReturnArtifact
): Promise<PortableConversationReturnArtifact> {
  if (
    artifact.branchId !== branch.branchId ||
    artifact.targetSessionId !== branch.source.sessionId
  ) {
    throw new Error('portable_conversation_branch_result_target_mismatch')
  }
  const attemptId = artifact.portable.attemptId ?? artifact.returnId
  const claim = await branchResultBeginPortableConversation(target, {
    returnId: artifact.returnId,
    attemptId
  })
  if (!claim.authorized) {
    return claim.result
  }
  const outcome = await deliverPortableConversationText(
    target,
    branch.source.portable.source,
    claim.result.content
  )
  const completed = await branchResultCompletePortableConversation(target, {
    returnId: claim.result.returnId,
    attemptId,
    ...outcome
  })
  return completed.result
}
