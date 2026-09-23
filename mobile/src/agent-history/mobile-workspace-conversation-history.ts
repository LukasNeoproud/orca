import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../src/shared/execution-host'
import { composeWorktreeHostIdentity } from '../../../src/shared/worktree/host-qualified-identity'
import type { Worktree } from '../worktree/workspace-list-types'
import { resolveMobileAgentHistorySessionWorktree } from './agent-history-session-worktree'

const MAX_INLINE_HISTORY_SESSIONS = 5

export function mobileWorkspaceExecutionHostId(
  worktree: Pick<Worktree, 'hostId' | 'hostContextHostId'>
): ExecutionHostId {
  return worktree.hostId ?? worktree.hostContextHostId ?? LOCAL_EXECUTION_HOST_ID
}

export function mobileWorkspaceHistoryIdentity(
  worktree: Pick<Worktree, 'worktreeId' | 'hostId' | 'hostContextHostId'>
): string {
  return composeWorktreeHostIdentity(mobileWorkspaceExecutionHostId(worktree), worktree.worktreeId)
}

export function buildMobileWorkspaceConversationHistory(
  worktrees: readonly Worktree[],
  sessionsByHost: ReadonlyMap<ExecutionHostId, readonly AiVaultSession[]>
): ReadonlyMap<string, AiVaultSession[]> {
  const result = new Map<string, AiVaultSession[]>()
  const worktreesByHost = new Map<ExecutionHostId, Worktree[]>()
  for (const worktree of worktrees) {
    const hostId = mobileWorkspaceExecutionHostId(worktree)
    const siblings = worktreesByHost.get(hostId) ?? []
    siblings.push(worktree)
    worktreesByHost.set(hostId, siblings)
  }
  for (const [hostId, sessions] of sessionsByHost) {
    const hostWorktrees = worktreesByHost.get(hostId) ?? []
    for (const session of sessions) {
      if (
        session.executionHostId !== hostId ||
        session.subagent !== null ||
        (session.structuredSession && session.structuredSession.ownerState !== 'unverifiable')
      ) {
        continue
      }
      const match = resolveMobileAgentHistorySessionWorktree({
        session,
        worktrees: hostWorktrees,
        activeWorktreeId: null
      })
      if (!match || match.status === 'archived') {
        continue
      }
      const key = composeWorktreeHostIdentity(hostId, match.worktreeId)
      const current = result.get(key) ?? []
      current.push(session)
      result.set(key, current)
    }
  }
  for (const sessions of result.values()) {
    sessions.sort((left, right) => sessionActivityTime(right) - sessionActivityTime(left))
    sessions.splice(MAX_INLINE_HISTORY_SESSIONS)
  }
  return result
}

function sessionActivityTime(session: AiVaultSession): number {
  const timestamp = Date.parse(session.updatedAt ?? session.modifiedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}
