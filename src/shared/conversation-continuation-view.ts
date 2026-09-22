import type {
  ConversationContinuationCandidate,
  ConversationContinuationInspection
} from './conversation-continuation'

export const CONVERSATION_CONTINUATION_CAPABILITY = 'conversation.continuation.v1' as const
export type ConversationContinuationMode = 'original' | 'compacted' | 'reference' | 'fresh'
export type ConversationContinuationView = ConversationContinuationInspection & {
  candidate: ConversationContinuationCandidate | null
  autoCompact: boolean
}
