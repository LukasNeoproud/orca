import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import type {
  PortableConversationBranchRecord,
  PortableConversationTerminalReceipt
} from '../../../shared/portable-conversation-branch'
import type { PortableConversationSource } from '../../../shared/portable-conversation-source'
import { parseAppSshPtyId } from '../../../shared/ssh-pty-id'
import { parseRemoteRuntimePtyId } from '../../../shared/remote-runtime-pty-id'
import { readPortableConversationSession } from './portable-conversation-source-client'
import {
  activateConversationTerminal,
  type WorkspaceConversationRoute
} from './workspace-conversation-activation'
import {
  openWorkspaceConversationHistory,
  type WorkspaceConversationOpenStatus
} from './workspace-conversation-history'
import {
  branchCompleteStartPortableConversation,
  resolvePortableConversationBranchTarget
} from './portable-conversation-branch-client'

export function portableConversationBranchTargetSource(
  branch: PortableConversationBranchRecord
): PortableConversationSource | null {
  if (branch.target.terminal.existingSource) {
    return branch.target.terminal.existingSource
  }
  const receipt = branch.target.terminal.launch?.receipt
  const provider = receipt?.providerSession
  const transcriptPath = provider?.transcriptPath ?? receipt?.history?.filePath
  if (!provider || !transcriptPath) {
    return null
  }
  const workspace = branch.target.terminal.workspace
  return {
    executionHostId: workspace.executionHostId,
    workspace: { id: workspace.workspaceId, path: workspace.path, kind: workspace.kind },
    provider: { agent: branch.target.agent, sessionId: provider.id },
    transcriptPath
  }
}

function activatePinnedReceipt(
  target: RuntimeClientTarget,
  route: WorkspaceConversationRoute,
  receipt: PortableConversationTerminalReceipt | null
): boolean {
  if (!receipt?.leafId || !receipt.ptyId) {
    return false
  }
  const state = useAppStore.getState()
  const ptyId = state.terminalLayoutsByTabId[receipt.tabId]?.ptyIdsByLeafId?.[receipt.leafId]
  if (ptyId !== receipt.ptyId) {
    return false
  }
  const paired = parseRemoteRuntimePtyId(ptyId)
  if (
    target.kind === 'environment'
      ? paired?.environmentId !== target.environmentId
      : paired !== null || parseAppSshPtyId(ptyId)?.connectionId !== route.executionHostId.slice(4)
  ) {
    return false
  }
  const provider = state.agentStatusByPaneKey[`${receipt.tabId}:${receipt.leafId}`]?.providerSession
  if (receipt.providerSession && provider?.id !== receipt.providerSession.id) {
    return false
  }
  return activateConversationTerminal(route, receipt.tabId, receipt.leafId)
}

export async function openPortableConversationBranch(
  target: RuntimeClientTarget,
  branch: PortableConversationBranchRecord
): Promise<WorkspaceConversationOpenStatus> {
  const workspace = branch.target.terminal.workspace
  const route: WorkspaceConversationRoute = {
    workspaceId: workspace.workspaceId,
    executionHostId: workspace.executionHostId,
    runtimeEnvironmentId: target.kind === 'environment' ? target.environmentId : null
  }
  const launch = branch.target.terminal.launch
  if (activatePinnedReceipt(target, route, launch?.receipt ?? null)) {
    return 'activated'
  }
  // A peer's nested SSH namespace must never be probed through the desktop's history state.
  if (target.kind === 'environment') {
    return 'unverifiable'
  }
  try {
    const resolved =
      !portableConversationBranchTargetSource(branch) && launch?.receipt?.providerSession
        ? (await resolvePortableConversationBranchTarget(target, branch.branchId)).branch
        : branch
    const source = portableConversationBranchTargetSource(resolved)
    if (!source) {
      return 'unverifiable'
    }
    const resolvedLaunch = resolved.target.terminal.launch
    const session = await readPortableConversationSession(target, source)
    return await openWorkspaceConversationHistory(route, session, {
      terminal: resolvedLaunch?.receipt ?? undefined,
      onRestored: async (opened, receipt) => {
        if (opened.kind !== 'terminal' || !resolvedLaunch) {
          return
        }
        await branchCompleteStartPortableConversation(target, {
          branchId: branch.branchId,
          attemptId: resolvedLaunch.attemptId,
          outcome: {
            kind: 'launched',
            receipt: {
              ...resolvedLaunch.receipt,
              ...receipt,
              tabId: opened.tabId
            }
          }
        })
      }
    })
  } catch {
    return 'unverifiable'
  }
}
