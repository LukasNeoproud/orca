import { useShallow } from 'zustand/react/shallow'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { structuredAgentLaunchSupported } from '@/lib/agent-launch-routing'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { readLocalRuntimeCapabilitiesOrUnknown } from '@/runtime/local-runtime-capabilities'
import { useAppStore } from '@/store'

export type StructuredAgentLaunchSupport = Readonly<Record<'claude' | 'codex', boolean>>

export function useStructuredAgentLaunchSupport(worktreeId: string): StructuredAgentLaunchSupport {
  return useAppStore(
    useShallow((state) => {
      const workspaceKind: 'floating' | 'folder' | 'git-worktree' =
        worktreeId === FLOATING_TERMINAL_WORKTREE_ID
          ? 'floating'
          : worktreeId.startsWith('folder:')
            ? 'folder'
            : 'git-worktree'
      const common = {
        settings: state.settings,
        executionHostId: getExecutionHostIdForWorktree(state, worktreeId),
        hostCapabilities: readLocalRuntimeCapabilitiesOrUnknown(),
        workspaceKind,
        projectRuntime: getLocalProjectExecutionRuntimeContext(state, worktreeId)
      }
      return {
        claude: structuredAgentLaunchSupported({ ...common, agent: 'claude' }),
        codex: structuredAgentLaunchSupported({ ...common, agent: 'codex' })
      }
    })
  )
}
