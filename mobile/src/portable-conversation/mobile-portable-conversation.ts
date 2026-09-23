import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison
} from '../../../src/shared/cross-platform-path'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceCursor,
  PortableConversationSourceIdentity,
  PortableConversationSourcePage
} from '../../../src/shared/portable-conversation-source'
import type { Worktree } from '../worktree/workspace-list-types'

export type MobilePortableConversationRoute = {
  source: PortableConversationSource
  sourceWorktree: Worktree
  targetWorktrees: Worktree[]
}

export type MobilePortableMessageOrigin = {
  cursor: PortableConversationSourceCursor
  identity: PortableConversationSourceIdentity
}

export type MobilePortableSourceState = {
  messages: NativeChatMessage[]
  origins: ReadonlyMap<string, MobilePortableMessageOrigin>
  completedAssistantMessageIds: ReadonlySet<string>
  nextCursor: PortableConversationSourceCursor | null
  identity: PortableConversationSourceIdentity | null
}

export const EMPTY_MOBILE_PORTABLE_SOURCE_STATE: MobilePortableSourceState = {
  messages: [],
  origins: new Map(),
  completedAssistantMessageIds: new Set(),
  nextCursor: null,
  identity: null
}

export function mobilePortableSourceKey(source: PortableConversationSource): string {
  return JSON.stringify([
    source.executionHostId,
    source.workspace.id,
    source.workspace.path,
    source.workspace.kind,
    source.provider.agent,
    source.provider.sessionId,
    source.transcriptPath
  ])
}

export function resolveMobilePortableConversationRoute(
  session: AiVaultSession,
  worktrees: readonly Worktree[]
): MobilePortableConversationRoute | null {
  if (
    (session.agent !== 'claude' && session.agent !== 'codex') ||
    !session.executionHostId.startsWith('ssh:') ||
    !session.cwd ||
    !session.filePath
  ) {
    return null
  }
  const candidates = worktrees.filter(
    (worktree) =>
      worktree.hostId === session.executionHostId &&
      isPathInsideOrEqual(worktree.path, session.cwd!)
  )
  const longest = Math.max(
    0,
    ...candidates.map((worktree) => normalizeRuntimePathForComparison(worktree.path).length)
  )
  const best = candidates.filter(
    (worktree) => normalizeRuntimePathForComparison(worktree.path).length === longest
  )
  if (best.length !== 1) {
    return null
  }
  const sourceWorktree = best[0]!
  const executionHostId = session.executionHostId as `ssh:${string}`
  return {
    source: {
      executionHostId,
      workspace: {
        id: sourceWorktree.worktreeId,
        path: sourceWorktree.path,
        kind: sourceWorktree.workspaceKind === 'folder-workspace' ? 'folder' : 'git-worktree'
      },
      provider: { agent: session.agent, sessionId: session.sessionId },
      transcriptPath: session.filePath
    },
    sourceWorktree,
    targetWorktrees: worktrees.filter(
      (worktree) =>
        worktree.hostId === executionHostId &&
        (sourceWorktree.workspaceKind === 'folder-workspace'
          ? worktree.worktreeId === sourceWorktree.worktreeId
          : worktree.workspaceKind !== 'folder-workspace' &&
            worktree.repoId === sourceWorktree.repoId)
    )
  }
}

function sameIdentity(
  left: PortableConversationSourceIdentity | null,
  right: PortableConversationSourceIdentity
): boolean {
  return (
    left !== null &&
    left.fingerprint === right.fingerprint &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  )
}

export function appendMobilePortableSourcePage(
  state: MobilePortableSourceState,
  page: PortableConversationSourcePage
): MobilePortableSourceState {
  const clear = state.identity !== null && !sameIdentity(state.identity, page.identity)
  const messages = clear ? [] : [...state.messages]
  const origins = clear ? new Map<string, MobilePortableMessageOrigin>() : new Map(state.origins)
  const completed = clear ? new Set<string>() : new Set(state.completedAssistantMessageIds)
  for (const id of page.turnEvidence?.completedAssistantMessageIds ?? []) {
    completed.add(id)
  }
  for (const message of page.transcriptMessages) {
    if (!origins.has(message.id)) {
      messages.push(message)
      origins.set(message.id, { cursor: page.cursor, identity: page.identity })
    }
  }
  return {
    messages,
    origins,
    completedAssistantMessageIds: completed,
    nextCursor: page.nextCursor,
    identity: page.identity
  }
}

export function mobilePortableSourceAnchor(
  state: MobilePortableSourceState,
  messageId: string
): PortableConversationSourceAnchor | null {
  if (!state.completedAssistantMessageIds.has(messageId)) {
    return null
  }
  const origin = state.origins.get(messageId)
  return origin ? { messageId, cursor: origin.cursor, identity: origin.identity } : null
}

export function targetedMobilePortableHandoff(contextMarkdown: string): string {
  return [
    '## Purpose and scope',
    'Address the selected response as a separate, independently verifiable task. Keep unrelated work outside this thread.',
    '## Explicit requirements and constraints',
    'Follow the existing project instructions and permissions. Do not assume permission to change unrelated code.',
    '## Accepted decisions',
    'No additional accepted decisions have been supplied. Do not treat agent proposals as user-approved decisions.',
    '## Source passage — agent response, not independently verified',
    contextMarkdown,
    '## References and open questions',
    'Verify claims and follow the references in the selected response. Ask about unresolved requirements before making irreversible decisions.',
    '## Expected verification',
    'Report the outcome, relevant artifacts, checks actually performed, and remaining uncertainty.'
  ].join('\n\n')
}

export function createMobilePortableConversationId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
