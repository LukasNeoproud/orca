import { useMemo } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { parseExecutionHostId } from '../../../src/shared/execution-host'
import type { Worktree } from '../worktree/workspace-list-types'
import { mobileWorkspaceExecutionHostId } from './mobile-workspace-conversation-history'

export function useMobileAgentHistoryRouteContext(worktrees: readonly Worktree[]) {
  const params = useLocalSearchParams<{
    executionHostId?: string | string[]
    session?: string | string[]
  }>()
  const executionHostId = parseExecutionHostId(
    Array.isArray(params.executionHostId) ? params.executionHostId[0] : params.executionHostId
  )?.id
  const selectedSessionId = Array.isArray(params.session) ? params.session[0] : params.session
  const hostWorktrees = useMemo(
    () =>
      executionHostId
        ? worktrees.filter(
            (worktree) => mobileWorkspaceExecutionHostId(worktree) === executionHostId
          )
        : worktrees,
    [executionHostId, worktrees]
  )
  return { executionHostId, selectedSessionId, hostWorktrees }
}
