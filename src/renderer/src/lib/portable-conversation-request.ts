import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor
} from '../../../shared/portable-conversation-source'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { resolveWorktreeOperationRouteForHost } from './worktree-operation-route'

export type PortableConversationRequest = {
  requestId?: string
  target: RuntimeClientTarget
  source: PortableConversationSource
  initialAnchor?: PortableConversationSourceAnchor
}
let request: PortableConversationRequest | null = null
const listeners = new Set<() => void>()

export function requestPortableConversation(value: PortableConversationRequest): void {
  request = { ...value, requestId: crypto.randomUUID() }
  listeners.forEach((listener) => listener())
}

export function requestPortableConversationFromHistory(
  session: AiVaultSession,
  workspaceId: string
): void {
  const host = parseExecutionHostId(session.executionHostId)
  if (host?.kind !== 'ssh' || (session.agent !== 'claude' && session.agent !== 'codex')) {
    throw new Error('This conversation does not support portable SSH branching.')
  }
  const state = useAppStore.getState()
  const workspace = state.getKnownWorktreeById(workspaceId, host.id)
  const route = resolveWorktreeOperationRouteForHost(state, workspaceId, host.id)
  if (!workspace || !route || route.executionHostId !== host.id) {
    throw new Error('The source workspace or execution host is unavailable.')
  }
  requestPortableConversation({
    target: route.runtimeEnvironmentId
      ? { kind: 'environment', environmentId: route.runtimeEnvironmentId }
      : { kind: 'local' },
    source: {
      executionHostId: host.id,
      workspace: {
        id: workspaceId,
        path: workspace.path,
        kind: parseWorkspaceKey(workspaceId)?.type === 'folder' ? 'folder' : 'git-worktree'
      },
      provider: { agent: session.agent, sessionId: session.sessionId },
      transcriptPath: session.filePath
    }
  })
}

export function closePortableConversation(): void {
  request = null
  listeners.forEach((listener) => listener())
}

export function usePortableConversationRequest(): PortableConversationRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => request,
    () => null
  )
}
