import { parseExecutionHostId } from '../../../src/shared/execution-host'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import {
  buildMobileNewTabAgentOptions,
  type MobileNewTabAgentOption,
  type MobileNewTabAgentSettings
} from '../session/mobile-new-tab-agent-options'
import { loadMobileNewTabAgentOptions } from '../session/mobile-new-tab-agent-loader'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  readMobileBacklogConversationOptions,
  selectMobileBacklogProjectWorkspaces,
  type MobileBacklogConversationOption
} from './mobile-backlog-task-options'

export async function loadMobileBacklogWorkspaces(
  client: Pick<RpcClient, 'sendRequest'>,
  sourceWorkspaceId: string
): Promise<Worktree[]> {
  const response = await client.sendRequest(
    'worktree.ps',
    { limit: 10_000 },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to load workspaces.')
  }
  const worktrees = ((response as RpcSuccess).result as { worktrees?: Worktree[] }).worktrees ?? []
  return selectMobileBacklogProjectWorkspaces(sourceWorkspaceId, worktrees)
}

export async function loadMobileBacklogConversations(
  client: Pick<RpcClient, 'sendRequest'>,
  workspaceId: string
): Promise<MobileBacklogConversationOption[]> {
  const response = await client.sendRequest(
    'session.tabs.list',
    { worktree: `id:${workspaceId}` },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to load conversations.')
  }
  return readMobileBacklogConversationOptions((response as RpcSuccess).result)
}

export async function loadMobileBacklogAgents(
  client: RpcClient,
  workspace: Worktree
): Promise<MobileNewTabAgentOption[]> {
  if (!isFolderWorkspace(workspace)) {
    return loadMobileNewTabAgentOptions({ client, worktreeId: workspace.worktreeId })
  }
  const host = parseExecutionHostId(workspace.hostId ?? 'local')
  const [settingsResponse, detectedResponse] = await Promise.all([
    client.sendRequest('settings.get'),
    host?.kind === 'ssh'
      ? client.sendRequest('preflight.detectRemoteAgents', { connectionId: host.targetId })
      : client.sendRequest('preflight.detectAgents')
  ])
  if (!settingsResponse.ok || !detectedResponse.ok) {
    const message = !settingsResponse.ok
      ? settingsResponse.error?.message
      : !detectedResponse.ok
        ? detectedResponse.error?.message
        : null
    throw new Error(message || 'Unable to load agents.')
  }
  const settings = (
    (settingsResponse as RpcSuccess).result as { settings?: MobileNewTabAgentSettings }
  ).settings
  return buildMobileNewTabAgentOptions(
    settings,
    (detectedResponse as RpcSuccess).result as unknown[]
  )
}

function isFolderWorkspace(workspace: Worktree): boolean {
  return (
    workspace.workspaceKind === 'folder-workspace' ||
    workspace.worktreeId.startsWith('folder:') ||
    workspace.repoId.startsWith('folder-workspace:')
  )
}
