import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  PortableConversationTopicIndexParams,
  PortableConversationTopicIndexResult,
  PortableConversationTopicIndexWriteParams,
  PortableConversationTopicIndexWriteResult
} from '../../../shared/portable-conversation-topic-index'
import { callPortableConversation } from './portable-conversation-source-client'

export function readPortableConversationTopicIndex(
  target: RuntimeClientTarget,
  params: PortableConversationTopicIndexParams
): Promise<PortableConversationTopicIndexResult> {
  return callPortableConversation(target, 'portableConversation.topicIndex', params)
}

export function writePortableConversationTopicIndex(
  target: RuntimeClientTarget,
  params: PortableConversationTopicIndexWriteParams
): Promise<PortableConversationTopicIndexWriteResult> {
  return callPortableConversation(target, 'portableConversation.writeTopicIndex', params)
}
