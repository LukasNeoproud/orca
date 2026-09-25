import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  detectAgentSessionContinuationAgents,
  launchAgentSessionContinuation
} from '@/lib/launch-agent-session-continuation'
import { useAppStore } from '@/store'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/tui-agent'

type UseContinuationTargetAgentArgs = {
  workspaceId: string
  enabled: boolean
  identity: string
}

type LaunchWorkspace = { id: string; path: string; hostId?: string }

function resolveWorkspace(workspaceId: string): LaunchWorkspace {
  const state = useAppStore.getState()
  const scope = parseWorkspaceKey(workspaceId)
  const worktreeId = scope?.type === 'worktree' ? scope.worktreeId : workspaceId
  const worktree = state.allWorktrees().find((entry) => entry.id === worktreeId)
  if (worktree?.path) {
    return worktree
  }
  const folderId = scope?.type === 'folder' ? scope.folderWorkspaceId : null
  const folder = folderId ? state.folderWorkspaces.find((entry) => entry.id === folderId) : null
  if (folder) {
    const workspace = folderWorkspaceToWorktree(folder)
    if (workspace.path) {
      return workspace
    }
  }
  throw new Error('The target workspace is no longer available.')
}

export function useContinuationTargetAgent({
  workspaceId,
  enabled,
  identity
}: UseContinuationTargetAgentArgs): {
  selectedAgent: TuiAgent
  setSelectedAgent: (agent: TuiAgent) => void
  agents: TuiAgent[]
  detecting: boolean
  error: string | null
  launch: (agent: TuiAgent, reference?: string, assertCurrent?: () => void) => Promise<void>
} {
  const disabledAgents = useAppStore((state) => state.settings?.disabledTuiAgents)
  const [selectedAgent, setSelectedAgent] = useState<TuiAgent>('codex')
  const [detectedAgents, setDetectedAgents] = useState<TuiAgent[]>([])
  const [detecting, setDetecting] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const current = useRef({ workspaceId, enabled, identity })
  current.current = { workspaceId, enabled, identity }
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    setSelectedAgent('codex')
    setDetectedAgents([])
    setDetecting(enabled)
    setError(null)
    if (!enabled) {
      return () => {
        mounted.current = false
      }
    }
    let cancelled = false
    try {
      const workspace = resolveWorkspace(workspaceId)
      void detectAgentSessionContinuationAgents(workspace.id)
        .then((agents) => {
          if (!cancelled) {
            setDetectedAgents(agents)
          }
        })
        .catch((cause) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause))
          }
        })
        .finally(() => {
          if (!cancelled) {
            setDetecting(false)
          }
        })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setDetecting(false)
    }
    return () => {
      cancelled = true
      mounted.current = false
    }
  }, [workspaceId, enabled, identity])

  const agents = useMemo<TuiAgent[]>(
    () => [
      'codex',
      ...detectedAgents.filter(
        (agent) => agent !== 'codex' && isTuiAgentEnabled(agent, disabledAgents)
      )
    ],
    [detectedAgents, disabledAgents]
  )

  const launch = useCallback(
    async (agent: TuiAgent, reference?: string, assertCurrent?: () => void): Promise<void> => {
      let selectedWorkspace: LaunchWorkspace | null = null
      const assertIdentity = (): void => {
        if (
          !mounted.current ||
          !current.current.enabled ||
          current.current.workspaceId !== workspaceId ||
          current.current.identity !== identity
        ) {
          throw new Error('The active conversation changed. Choose how to continue again.')
        }
        if (selectedWorkspace) {
          const latestWorkspace = resolveWorkspace(workspaceId)
          if (
            latestWorkspace.id !== selectedWorkspace.id ||
            latestWorkspace.path !== selectedWorkspace.path ||
            latestWorkspace.hostId !== selectedWorkspace.hostId
          ) {
            throw new Error('The target workspace changed. Choose how to continue again.')
          }
        }
        assertCurrent?.()
      }
      assertIdentity()
      const workspace = resolveWorkspace(workspaceId)
      selectedWorkspace = workspace
      const launched = await launchAgentSessionContinuation({
        agent,
        ...(reference ? { prompt: reference } : {}),
        worktreeId: workspace.id,
        workspacePath: workspace.path,
        initialCwd: workspace.path,
        launchSource: 'sidebar',
        assertCurrent: assertIdentity
      })
      assertIdentity()
      if (!launched) {
        throw new Error('Could not start a new agent session on this workspace host.')
      }
    },
    [workspaceId, identity]
  )

  return { selectedAgent, setSelectedAgent, agents, detecting, error, launch }
}
