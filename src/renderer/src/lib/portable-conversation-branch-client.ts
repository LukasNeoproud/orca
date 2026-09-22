import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  PortableConversationBranchResolveTargetResult,
  PortableConversationBranchPreviewParams,
  PortableConversationBranchPreviewResult,
  PortableConversationBranchPrepareParams,
  PortableConversationBranchPrepareResult,
  PortableConversationBranchBeginStartParams,
  PortableConversationBranchBeginStartResult,
  PortableConversationBranchCompleteStartParams,
  PortableConversationBranchCompleteStartResult,
  PortableConversationBranchResultPrepareParams,
  PortableConversationBranchResultPrepareResult,
  PortableConversationBranchResultBeginParams,
  PortableConversationBranchResultBeginResult,
  PortableConversationBranchResultCompleteParams,
  PortableConversationBranchResultCompleteResult,
  PortableConversationBranchesParams,
  PortableConversationBranchesResult
} from '../../../shared/portable-conversation-branch'
import { callPortableConversation } from './portable-conversation-source-client'

export function branchPreviewPortableConversation(
  target: RuntimeClientTarget,
  params: PortableConversationBranchPreviewParams
): Promise<PortableConversationBranchPreviewResult> {
  return callPortableConversation(target, 'portableConversation.branchPreview', params)
}

export function branchPreparePortableConversation(
  target: RuntimeClientTarget,
  params: PortableConversationBranchPrepareParams
): Promise<PortableConversationBranchPrepareResult> {
  return callPortableConversation(target, 'portableConversation.branchPrepare', params)
}

export function branchBeginStartPortableConversation(
  target: RuntimeClientTarget,
  params: PortableConversationBranchBeginStartParams
): Promise<PortableConversationBranchBeginStartResult> {
  return callPortableConversation(target, 'portableConversation.branchBeginStart', params)
}

export function branchCompleteStartPortableConversation(
  target: RuntimeClientTarget,
  params: PortableConversationBranchCompleteStartParams
): Promise<PortableConversationBranchCompleteStartResult> {
  return callPortableConversation(target, 'portableConversation.branchCompleteStart', params)
}

export function branchResultPreparePortableConversation(
  target: RuntimeClientTarget,
  params: PortableConversationBranchResultPrepareParams
): Promise<PortableConversationBranchResultPrepareResult> {
  return callPortableConversation(target, 'portableConversation.branchResultPrepare', params)
}

export function branchResultBeginPortableConversation(
  target: RuntimeClientTarget,
  params: PortableConversationBranchResultBeginParams
): Promise<PortableConversationBranchResultBeginResult> {
  return callPortableConversation(target, 'portableConversation.branchResultBegin', params)
}

export function branchResultCompletePortableConversation(
  target: RuntimeClientTarget,
  params: PortableConversationBranchResultCompleteParams
): Promise<PortableConversationBranchResultCompleteResult> {
  return callPortableConversation(target, 'portableConversation.branchResultComplete', params)
}

export function readPortableConversationBranches(
  target: RuntimeClientTarget,
  params: PortableConversationBranchesParams
): Promise<PortableConversationBranchesResult> {
  return callPortableConversation(target, 'portableConversation.branches', params)
}

export function resolvePortableConversationBranchTarget(
  target: RuntimeClientTarget,
  branchId: string
): Promise<PortableConversationBranchResolveTargetResult> {
  return callPortableConversation(target, 'portableConversation.branchResolveTarget', { branchId })
}
