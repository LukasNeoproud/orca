export type ConversationContinuationSource = {
  providerSessionId: string
  workspaceId: string
}

export type ConversationContinuationCheckpoint = {
  lastTurnId: string
  completedAt: string
  /** Stable for the exact source transcript prefix ending at this completed turn. */
  revision: string
}

export type ConversationContinuationInspection = {
  source: ConversationContinuationSource
  checkpoint: ConversationContinuationCheckpoint | null
}

export const CONVERSATION_CONTINUATION_CANDIDATE_STATUSES = [
  'preparing',
  'ready',
  'unconfirmed',
  'failed',
  'stale',
  'used'
] as const

export type ConversationContinuationCandidateStatus =
  (typeof CONVERSATION_CONTINUATION_CANDIDATE_STATUSES)[number]

export type ConversationContinuationCompactionOrigin = 'automatic' | 'manual'

export type ConversationContinuationCandidate = {
  candidateId: string
  source: ConversationContinuationSource
  checkpoint: ConversationContinuationCheckpoint
  status: ConversationContinuationCandidateStatus
  providerSessionId?: string
  transcriptPath?: string
  error?: string
  createdAt: string
  updatedAt: string
  /** Absent on existing compacted copies. Fresh candidates never copy source history. */
  mode?: 'fresh'
  handoffDigest?: string
  /** Absent when the preparation origin is unknown. */
  compactionOrigin?: ConversationContinuationCompactionOrigin
}

export type ConversationContinuationPrepareInput = {
  source: ConversationContinuationSource
  expectedRevision: string
}

export type ConversationContinuationReference = {
  reference: string
}
