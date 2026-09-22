import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { PORTABLE_CONVERSATION_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceContext,
  PortableConversationSourceContextMode,
  PortableConversationSourceCursor,
  PortableConversationSourcePage
} from '../../../shared/portable-conversation-source'
import { callConversationRuntimeFeature } from './conversation-runtime-rpc'

export function callPortableConversation<T>(
  target: RuntimeClientTarget,
  method: string,
  params: unknown
): Promise<T> {
  return callConversationRuntimeFeature<T>(
    target,
    PORTABLE_CONVERSATION_RUNTIME_CAPABILITY,
    'Update the controlling Orca runtime to use portable SSH conversations.',
    method,
    params
  )
}

export function readPortableConversationPage(
  target: RuntimeClientTarget,
  source: PortableConversationSource,
  cursor?: PortableConversationSourceCursor
) {
  return callPortableConversation<PortableConversationSourcePage>(
    target,
    'portableConversation.sourcePage',
    { source, ...(cursor ? { cursor } : {}) }
  )
}

export function readPortableConversationContext(
  target: RuntimeClientTarget,
  source: PortableConversationSource,
  anchor: PortableConversationSourceAnchor,
  mode: PortableConversationSourceContextMode
) {
  return callPortableConversation<PortableConversationSourceContext>(
    target,
    'portableConversation.sourceContext',
    { source, anchor, mode }
  )
}

export function readPortableConversationSession(
  target: RuntimeClientTarget,
  source: PortableConversationSource
) {
  return callPortableConversation<AiVaultSession>(target, 'portableConversation.sourceSession', {
    source
  })
}
