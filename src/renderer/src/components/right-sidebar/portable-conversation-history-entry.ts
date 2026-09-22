import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { AiVaultSessionWorktreeInfo } from './ai-vault-session-worktree'

/** Returns the session-owned workspace only when portable SSH history is provable. */
export function portableConversationHistoryWorkspaceId(
  session: AiVaultSession,
  worktreeInfo: AiVaultSessionWorktreeInfo | null
): string | null {
  const host = parseExecutionHostId(session.executionHostId)
  if (
    host?.kind !== 'ssh' ||
    (session.agent !== 'claude' && session.agent !== 'codex') ||
    !session.filePath?.trim() ||
    !worktreeInfo?.worktreeId
  ) {
    return null
  }
  return worktreeInfo.worktreeId
}
