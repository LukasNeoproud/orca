import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import { detectAgentStatusFromTitle } from '../../../../shared/agent-detection'
import { makePaneKey } from '../../../../shared/stable-pane-id'

export type CodexConversationContinuationSource = {
  paneId: number
  paneKey: string
  providerSessionId: string
  transcriptPath: string | null
  workspaceId: string
  target: RuntimeClientTarget
}

type CodexConversationContinuationInputs = {
  status: ReturnType<typeof useAppStore.getState>['agentStatusByPaneKey'][string] | undefined
  environmentId: string | null
  connectionId: string | null | undefined
}

type CodexConversationContinuationState = Parameters<typeof getRuntimeEnvironmentIdForWorktree>[0] &
  Parameters<typeof getConnectionIdFromState>[0] & {
    agentStatusByPaneKey: ReturnType<typeof useAppStore.getState>['agentStatusByPaneKey']
    runtimePaneTitlesByTabId: ReturnType<typeof useAppStore.getState>['runtimePaneTitlesByTabId']
  }

/**
 * Resolves the live Codex identity on the pane that opened the continuation UI.
 * Direct SSH has no runtime client route, so it must never fall through to a
 * local app-server call.
 */
export function resolveCodexConversationContinuationSource(
  state: CodexConversationContinuationState,
  args: { pane: ManagedPane; tabId: string; worktreeId: string }
): CodexConversationContinuationSource | null {
  return createCodexConversationContinuationSource(
    {
      status: state.agentStatusByPaneKey[makePaneKey(args.tabId, args.pane.leafId)],
      environmentId: getRuntimeEnvironmentIdForWorktree(state, args.worktreeId),
      connectionId: getConnectionIdFromState(state, args.worktreeId)
    },
    args
  )
}

export function createCodexConversationContinuationSource(
  inputs: CodexConversationContinuationInputs,
  args: { pane: ManagedPane; tabId: string; worktreeId: string }
): CodexConversationContinuationSource | null {
  const { status } = inputs
  const providerSession = status?.providerSession
  const providerSessionId = providerSession?.id.trim()
  if (
    status?.agentType !== 'codex' ||
    providerSession?.key !== 'session_id' ||
    !providerSessionId
  ) {
    return null
  }

  const target: RuntimeClientTarget | null = inputs.environmentId
    ? { kind: 'environment', environmentId: inputs.environmentId }
    : inputs.connectionId === null
      ? { kind: 'local' }
      : null
  if (!target) {
    return null
  }

  return {
    paneId: args.pane.id,
    paneKey: makePaneKey(args.tabId, args.pane.leafId),
    providerSessionId,
    transcriptPath: providerSession.transcriptPath?.trim() || null,
    workspaceId: args.worktreeId,
    target
  }
}

export function prepareCodexConversationContinuationSource(args: {
  pane: ManagedPane
  tabId: string
  worktreeId: string
}): CodexConversationContinuationSource | null {
  return resolveCodexConversationContinuationSource(useAppStore.getState(), args)
}

/** Hook reports are authoritative; the live TUI title catches delayed turn transitions. */
export function isCodexConversationContinuationBusy(
  state: CodexConversationContinuationState,
  args: { pane: ManagedPane; tabId: string }
): boolean {
  const paneKey = makePaneKey(args.tabId, args.pane.leafId)
  if (state.agentStatusByPaneKey[paneKey]?.state === 'working') {
    return true
  }
  return (
    detectAgentStatusFromTitle(state.runtimePaneTitlesByTabId[args.tabId]?.[args.pane.id] ?? '') ===
    'working'
  )
}
