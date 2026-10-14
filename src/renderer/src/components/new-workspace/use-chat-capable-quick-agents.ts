import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { resolveAgentSessionLaunchRoute } from '@/lib/agent-session-launch-plan'
import type { AgentCatalogEntry } from '@/lib/agent-catalog'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { isTuiAgent } from '../../../../shared/tui-agent-config'

/** The listed agents this dialog would open as a native chat, by the route quick-create takes. */
export function useChatCapableQuickAgents(
  agents: readonly AgentCatalogEntry[],
  target: {
    repoId: string
    selectedRepoIsGit: boolean
    selectedRepoExecutionHostId?: ExecutionHostId | null
  }
): ReadonlySet<TuiAgent> {
  // A joined string keeps the selector's result stable across unrelated store updates.
  const joined = useAppStore((state) =>
    agents
      .filter(
        (agent) =>
          resolveAgentSessionLaunchRoute(state, {
            agent: agent.id,
            workspace: {
              kind: target.selectedRepoIsGit ? 'git-worktree' : 'folder',
              repoId: target.repoId,
              executionHostId: target.selectedRepoExecutionHostId ?? undefined
            }
          }) === 'structured-native-chat'
      )
      .map((agent) => agent.id)
      .join(',')
  )
  return useMemo(() => new Set(joined.split(',').filter(isTuiAgent)), [joined])
}
