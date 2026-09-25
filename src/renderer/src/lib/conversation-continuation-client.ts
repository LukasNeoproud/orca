import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  assertConversationRuntimeFeature,
  callConversationRuntimeFeature
} from './conversation-runtime-rpc'
import { CONVERSATION_CONTINUATION_CANDIDATE_REFERENCE_CAPABILITY } from '../../../shared/protocol-version'
import {
  CONVERSATION_CONTINUATION_CAPABILITY,
  type ConversationContinuationView
} from '../../../shared/conversation-continuation-view'
import type {
  ConversationContinuationCandidate,
  ConversationContinuationReference,
  ConversationContinuationSource
} from '../../../shared/conversation-continuation'

function call<T>(target: RuntimeClientTarget, action: string, params: unknown): Promise<T> {
  return callConversationRuntimeFeature(
    target,
    CONVERSATION_CONTINUATION_CAPABILITY,
    'Update the owning Orca runtime to use conversation continuation.',
    `conversationContinuation.${action}`,
    params
  )
}
const identity = (source: ConversationContinuationSource): ConversationContinuationSource => ({
  providerSessionId: source.providerSessionId,
  workspaceId: source.workspaceId
})

export const inspectContinuation = (
  target: RuntimeClientTarget,
  source: ConversationContinuationSource
) => call<ConversationContinuationView>(target, 'inspect', { source: identity(source) })
export const prepareContinuation = (
  target: RuntimeClientTarget,
  source: ConversationContinuationSource,
  expectedRevision: string
) =>
  call<ConversationContinuationCandidate>(target, 'prepare', {
    source: identity(source),
    expectedRevision
  })
export const referenceContinuation = (
  target: RuntimeClientTarget,
  source: ConversationContinuationSource,
  expectedRevision: string
) =>
  call<ConversationContinuationReference>(target, 'reference', {
    source: identity(source),
    expectedRevision
  })
export const claimContinuationCandidate = (target: RuntimeClientTarget, candidateId: string) =>
  call<ConversationContinuationCandidate>(target, 'claim', { candidateId })

export const assertContinuationCandidateReferenceSupported = (target: RuntimeClientTarget) =>
  assertConversationRuntimeFeature(
    target,
    CONVERSATION_CONTINUATION_CANDIDATE_REFERENCE_CAPABILITY,
    'Update the owning Orca runtime to pass compacted context to another agent.'
  )

export const referenceContinuationCandidate = (
  target: RuntimeClientTarget,
  source: ConversationContinuationSource,
  expectedRevision: string,
  candidateId: string
) =>
  callConversationRuntimeFeature<ConversationContinuationReference>(
    target,
    CONVERSATION_CONTINUATION_CANDIDATE_REFERENCE_CAPABILITY,
    'Update the owning Orca runtime to pass compacted context to another agent.',
    'conversationContinuation.candidateReference',
    { source: identity(source), expectedRevision, candidateId }
  )
