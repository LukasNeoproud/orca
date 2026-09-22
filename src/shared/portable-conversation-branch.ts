import type {
  AgentSessionBranchRecord,
  AgentSessionBranchRelationKind,
  AgentSessionReturnArtifact
} from './agent-session-branch'
import type { AgentProviderSessionMetadata, ResumableTuiAgent } from './agent-session-resume'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceContext,
  PortableConversationSourceContextMode,
  PortableConversationSourceIdentity
} from './portable-conversation-source'
import { PORTABLE_CONVERSATION_RUNTIME_CAPABILITY } from './protocol-version'
import { sha256 } from './sha256'

export const PORTABLE_CONVERSATION_BRANCH_RUNTIME_CAPABILITY =
  PORTABLE_CONVERSATION_RUNTIME_CAPABILITY

export type PortableConversationBranchWorkspace = {
  workspaceId: string
  path: string
  kind: 'git-worktree' | 'folder'
  executionHostId: `ssh:${string}`
  projectId: string
}

export type PortableConversationTerminalReceipt = {
  tabId: string
  leafId?: string
  paneKey?: string
  ptyId?: string
  launchAgent?: ResumableTuiAgent
  providerSession?: AgentProviderSessionMetadata
  history?: { filePath: string; codexHome?: string; cwd?: string }
}

export type PortableConversationLaunch = {
  attemptId: string
  status: 'pending' | 'accepted' | 'rejected' | 'unknown'
  receipt: PortableConversationTerminalReceipt | null
  reason: string | null
}

export type PortableConversationBranchRecord = AgentSessionBranchRecord & {
  source: AgentSessionBranchRecord['source'] & {
    portable: {
      source: PortableConversationSource
      anchor: PortableConversationSourceAnchor
      identity: PortableConversationSourceIdentity
      contextSha256: string
      projectId: string
    }
  }
  target: AgentSessionBranchRecord['target'] & {
    terminal: {
      workspace: PortableConversationBranchWorkspace
      launch: PortableConversationLaunch | null
      existingSource?: PortableConversationSource
    }
  }
  handoff: AgentSessionBranchRecord['handoff'] & { mechanism: 'portable-transcript' }
  providerFork: null
}

function portableSessionDigest(parts: readonly string[]): string {
  const digest = sha256(new TextEncoder().encode(parts.join('\0')))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Stable alias used to reconnect a later source view to the terminal branch that created it. */
export function portableConversationSourceSessionId(source: PortableConversationSource): string {
  return `portable-${portableSessionDigest([
    source.executionHostId,
    source.provider.agent,
    source.provider.sessionId,
    source.transcriptPath
  ])}`
}

export function portableConversationTerminalSessionId(input: {
  executionHostId: `ssh:${string}`
  agent: string
  providerSession: AgentProviderSessionMetadata
  history?: { filePath: string }
}): string | null {
  const transcriptPath = input.history?.filePath ?? input.providerSession.transcriptPath
  return transcriptPath
    ? `portable-${portableSessionDigest([
        input.executionHostId,
        input.agent,
        input.providerSession.id,
        transcriptPath
      ])}`
    : null
}

export type PortableConversationBranchPreviewParams = {
  source: PortableConversationSource
  anchor: PortableConversationSourceAnchor
  mode: PortableConversationSourceContextMode
  anchorRole?: 'user' | 'assistant'
}

export type PortableConversationBranchPreviewResult = {
  context: PortableConversationSourceContext
  contextSha256: string
}

export type PortableConversationBranchPrepareParams = {
  branchId: string
  title: string
  relationKind: AgentSessionBranchRelationKind
  dependsOnBranchIds?: string[]
  source: PortableConversationSource
  anchor: PortableConversationSourceAnchor
  anchorRole?: 'user' | 'assistant'
  target: {
    sessionId: string
    agent: 'claude' | 'codex'
    workspaceId: string
    executionHostId: `ssh:${string}`
  }
  handoff: {
    mode: PortableConversationSourceContextMode
    /** Exact immutable user turn that the renderer may send after claiming start. */
    content: string
    sourceContextSha256: string
  }
}

export type PortableConversationBranchPrepareResult = {
  branch: PortableConversationBranchRecord
}

export type PortableConversationBranchBeginStartParams = {
  branchId: string
  attemptId: string
}

export type PortableConversationBranchBeginStartResult = {
  branch: PortableConversationBranchRecord
  authorized: boolean
}

export type PortableConversationBranchCompleteStartParams = {
  branchId: string
  attemptId: string
  outcome:
    | {
        kind: 'launched'
        receipt: PortableConversationTerminalReceipt
        /** Terminal input alone is not an acknowledgement. */
        acknowledged?: true
      }
    | { kind: 'failed-before-launch'; reason: string }
}

export type PortableConversationBranchCompleteStartResult = {
  branch: PortableConversationBranchRecord
}

export type PortableConversationBranchResolveTargetParams = { branchId: string }
export type PortableConversationBranchResolveTargetResult = {
  branch: PortableConversationBranchRecord
}

export type PortableConversationBranchesParams = {
  sessionId: string
  /** Lets a child history row recover a missing target transcript path before alias traversal. */
  source?: PortableConversationSource
}
export type PortableConversationBranchesResult = {
  branches: PortableConversationBranchRecord[]
  returns: PortableConversationReturnArtifact[]
}

export type PortableConversationReturnArtifact = AgentSessionReturnArtifact & {
  portable: {
    attemptId: string | null
  }
}

export type PortableConversationBranchResultPrepareParams = {
  returnId: string
  branchId: string
  content: string
}
export type PortableConversationBranchResultPrepareResult = {
  result: PortableConversationReturnArtifact
}

export type PortableConversationBranchResultBeginParams = {
  returnId: string
  attemptId: string
}
export type PortableConversationBranchResultBeginResult = {
  result: PortableConversationReturnArtifact
  authorized: boolean
}

export type PortableConversationBranchResultCompleteParams = {
  returnId: string
  attemptId: string
  status: 'accepted' | 'rejected' | 'unknown'
  reason?: string
}
export type PortableConversationBranchResultCompleteResult = {
  result: PortableConversationReturnArtifact
}
