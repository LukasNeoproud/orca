import { getWorkspaceSourceName } from '../../../src/shared/new-workspace/workspace-source'
import { WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcSuccess } from '../transport/types'
import type { MobileComposerCreateSelection } from './mobile-composer-source-types'
import { resolveMobileWorkspaceCreateName } from './mobile-workspace-name'
import type { CreateWorkspaceFromComposerArgs } from './source-workspace-create'
import { advancedWorkspaceCreateFields } from './workspace-create-params'
import { createWorktreeWithNameRetry, type WorktreeCreateResult } from './worktree-create-retry'

export async function createJiraWorkspace(
  args: CreateWorkspaceFromComposerArgs & {
    selection: Extract<MobileComposerCreateSelection, { kind: 'work-item' }>
  }
): Promise<WorktreeCreateResult> {
  const status = await args.client.sendRequest('status.get')
  const capabilities = status.ok
    ? ((status as RpcSuccess).result as { capabilities?: unknown }).capabilities
    : null
  if (
    !Array.isArray(capabilities) ||
    !capabilities.includes(WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY)
  ) {
    return { error: 'Update Orca on the host to link Jira issues to worktrees.' }
  }
  const { jiraSourceContext, ...item } = args.selection.item
  const sourceName = getWorkspaceSourceName(item)
  const name = resolveMobileWorkspaceCreateName({
    draft: args.workspaceName,
    fallback: item.jiraIdentifier?.toLowerCase() || sourceName.seedName
  })
  const manualLabel =
    args.advanced?.displayLabel?.trim() ||
    (args.nameIsAutoManaged === false ? args.workspaceName?.trim() : undefined)
  const displayName = manualLabel || sourceName.displayName
  return createWorktreeWithNameRetry({
    client: args.client,
    baseName: name,
    worktreeCreateIdempotency: args.worktreeCreateIdempotency,
    recoverCompletedCheckoutFailure: args.recoverCompletedCheckoutFailure,
    createMethod: args.explicitCreation ? 'worktree.createExplicit' : 'worktree.create',
    maxAttempts: args.explicitCreation ? 1 : undefined,
    buildParams: (candidate) => ({
      repo: `id:${args.targetRepoId}`,
      name: candidate,
      linkedWorkItem: item,
      ...(jiraSourceContext ? { linkedTaskSourceContext: jiraSourceContext } : {}),
      setupDecision: args.setupDecision,
      displayName,
      displayNameKind: manualLabel ? 'user' : 'generated',
      ...(args.agent.choice !== 'blank'
        ? { createdWithAgent: args.agent.choice, startupDraft: item.url }
        : {}),
      ...(args.note?.trim() ? { comment: args.note.trim() } : {}),
      ...(args.explicitCreation ? { explicitCreation: args.explicitCreation } : {}),
      ...(args.advanced ? advancedWorkspaceCreateFields(args.advanced) : {})
    })
  })
}
