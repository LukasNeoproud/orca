import { parseAgentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { readCodexThreadId } from './codex-structured-thread-facts'
import type {
  CodexSession,
  CodexStructuredSessionAdapterDeps
} from './codex-structured-session-state'

export async function forkCodexStructuredConversation(input: {
  request: Parameters<NonNullable<StructuredAgentSessionAdapter['forkConversation']>>[0]
  source: Pick<CodexSession, 'connection' | 'threadId'>
  deps: Pick<CodexStructuredSessionAdapterDeps, 'requestTimeoutMs' | 'resolveWorkspacePath'>
}): Promise<{ providerSessionId: string }> {
  const boundary = parseAgentJournalItemKey(input.request.boundaryItemId)
  if (
    boundary?.provider !== 'codex' ||
    boundary.threadId !== input.source.threadId ||
    !input.deps.resolveWorkspacePath
  ) {
    throw new Error('agent_session_branch_invalid_anchor')
  }
  const response = await input.source.connection.request(
    'thread/fork',
    {
      threadId: input.source.threadId,
      lastTurnId: boundary.turnId,
      cwd: await input.deps.resolveWorkspacePath(input.request.targetLocation.workspaceId),
      excludeTurns: true,
      deferGoalContinuation: true
    },
    { timeoutMs: input.deps.requestTimeoutMs }
  )
  const providerSessionId = readCodexThreadId(response)
  if (!providerSessionId || providerSessionId === input.source.threadId) {
    throw new Error('agent_session_branch_provider_identity_missing')
  }
  return { providerSessionId }
}
