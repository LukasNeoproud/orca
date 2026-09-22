import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { PortableConversationProposalNotice } from '../../../shared/portable-conversation-proposal'
import type { PortableConversationSource } from '../../../shared/portable-conversation-source'
import type {
  PortableConversationProposalAnalyzeParams,
  PortableConversationProposalAnalyzeResult,
  PortableConversationProposalConfirmParams,
  PortableConversationProposalConfirmResult,
  PortableConversationProposalGetParams,
  PortableConversationProposalPreference,
  PortableConversationProposalPutParams,
  PortableConversationProposalRecord
} from '../../../shared/portable-conversation-proposal'
import { callPortableConversation } from './portable-conversation-source-client'
export const portableProposalClient = {
  analyze: (target: RuntimeClientTarget, params: PortableConversationProposalAnalyzeParams) =>
    callPortableConversation<PortableConversationProposalAnalyzeResult>(
      target,
      'portableConversation.proposalAnalyze',
      params
    ),
  get: (target: RuntimeClientTarget, source: PortableConversationSource, proposalId?: string) =>
    callPortableConversation<{ proposal: PortableConversationProposalRecord | null }>(
      target,
      'portableConversation.proposalGet',
      {
        source,
        ...(proposalId ? { proposalId } : {})
      } satisfies PortableConversationProposalGetParams
    ),
  put: (target: RuntimeClientTarget, params: PortableConversationProposalPutParams) =>
    callPortableConversation<{ proposal: PortableConversationProposalRecord }>(
      target,
      'portableConversation.proposalPut',
      params
    ),
  preferenceGet: (target: RuntimeClientTarget, source: PortableConversationSource) =>
    callPortableConversation<{ preference: PortableConversationProposalPreference }>(
      target,
      'portableConversation.proposalPreferenceGet',
      { source }
    ),
  preferenceSet: (
    target: RuntimeClientTarget,
    params: {
      source: PortableConversationSource
      scope: 'session' | 'workspace' | 'global'
      enabled: boolean
    }
  ) =>
    callPortableConversation<{ preference: PortableConversationProposalPreference }>(
      target,
      'portableConversation.proposalPreferenceSet',
      params
    ),
  notices: (target: RuntimeClientTarget, proposalId: string) =>
    callPortableConversation<{
      notices: PortableConversationProposalNotice[]
    }>(target, 'portableConversation.proposalNotices', { proposalId }),
  confirm: (
    target: RuntimeClientTarget,
    params: PortableConversationProposalConfirmParams & { itemIds?: string[] }
  ) =>
    callPortableConversation<PortableConversationProposalConfirmResult>(
      target,
      'portableConversation.proposalConfirm',
      params
    )
}
