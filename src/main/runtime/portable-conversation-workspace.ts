import type { OrcaRuntimeService } from './orca-runtime'
import { parseExecutionHostId } from '../../shared/execution-host'
import { getProjectIdentityKey } from '../../shared/project-host-setup-projection'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { resolveWorktreeHostRouting } from './worktree-launch-host-repo'

export type PortableConversationWorkspace = {
  workspaceId: string
  path: string
  kind: 'git-worktree' | 'folder'
  executionHostId: `ssh:${string}`
  connectionId: string
  projectId: string
}

export async function resolvePortableConversationWorkspace(
  runtime: Pick<OrcaRuntimeService, 'showManagedTerminalWorkspace' | 'listRepos'>,
  workspaceId: string,
  expectedExecutionHostId: string
): Promise<PortableConversationWorkspace> {
  const expected = parseExecutionHostId(expectedExecutionHostId)
  if (expected?.kind !== 'ssh') {
    throw new Error('portable_conversation_requires_ssh_owner')
  }
  const workspace = await runtime.showManagedTerminalWorkspace(`id:${workspaceId}`)
  if (workspace.id !== workspaceId) {
    throw new Error('portable_conversation_workspace_mismatch')
  }
  const folder = parseWorkspaceKey(workspaceId)?.type === 'folder'
  const routing = folder ? null : resolveWorktreeHostRouting(runtime.listRepos(), workspace)
  const host = parseExecutionHostId(
    folder ? workspace.hostId : routing?.kind === 'resolved' ? routing.hostId : null
  )
  if (host?.kind !== 'ssh' || host.id !== expected.id) {
    throw new Error('portable_conversation_execution_owner_mismatch')
  }
  let projectId = workspace.id
  if (!folder) {
    if (routing?.kind !== 'resolved' || !routing.repo) {
      throw new Error('portable_conversation_project_unavailable')
    }
    projectId = getProjectIdentityKey(routing.repo)
  }
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    kind: folder ? 'folder' : 'git-worktree',
    executionHostId: host.id,
    connectionId: host.targetId,
    projectId
  }
}
