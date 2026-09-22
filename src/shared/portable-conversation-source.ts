import type { NativeChatMessage } from './native-chat-types'

export type PortableConversationSource = {
  executionHostId: `ssh:${string}`
  workspace: {
    id: string
    path: string
    kind: 'git-worktree' | 'folder'
  }
  provider: {
    agent: 'claude' | 'codex'
    sessionId: string
  }
  transcriptPath: string
}

/** A re-readable source-file identity supplied by the host that owns the path. */
export type PortableConversationSourceIdentity = {
  fingerprint: string
  size: number
  mtimeMs: number
}

/** Opaque cursor returned by the source reader; callers must never manufacture one. */
export type PortableConversationSourceCursor = {
  offset: number
  boundaryCheckpoint: string | null
  fileFingerprint: string
}

export type PortableConversationTurnEvidence = {
  /** Assistant rows whose turn was explicitly completed by the provider transcript. */
  completedAssistantMessageIds: string[]
  /** Carries a cross-page candidate until a later provider terminal marker settles it. */
  pendingAssistantMessageId: string | null
}

export type PortableConversationSourceAnchor = {
  messageId: string
  cursor: PortableConversationSourceCursor
  identity: PortableConversationSourceIdentity
  selectedText?: string
}

export type PortableConversationSourcePage = {
  source: PortableConversationSource
  transcriptMessages: NativeChatMessage[]
  cursor: PortableConversationSourceCursor
  nextCursor: PortableConversationSourceCursor | null
  identity: PortableConversationSourceIdentity
  limited: boolean
  warnings: string[]
  /** Absent only when talking to an older host that cannot prove turn completion. */
  turnEvidence?: PortableConversationTurnEvidence
}

export type PortableConversationSourceContextMode = 'history' | 'targeted'

export type PortableConversationSourceContext = {
  source: PortableConversationSource
  anchor: PortableConversationSourceAnchor
  identity: PortableConversationSourceIdentity
  verification: {
    cursor: PortableConversationSourceCursor
    selectedMessageId: string
  }
  selectedPassage: string
  contextMarkdown: string
  historyTruncated: boolean
  warnings: string[]
}
