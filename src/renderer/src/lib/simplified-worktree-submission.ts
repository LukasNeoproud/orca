import type { WorktreeCreationRequest } from './pending-worktree-creation'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ExplicitWorktreeCreation } from '../../../shared/worktree/explicit-creation'

export type SimplifiedWorktreeSubmission = {
  explicitCreation: ExplicitWorktreeCreation
  name: string
  displayName: string
  baseBranch?: string
}

export function applySimplifiedWorktreeSubmission(
  request: WorktreeCreationRequest,
  explicit: SimplifiedWorktreeSubmission,
  executionHostId?: ExecutionHostId | null
): void {
  Object.assign(request, {
    executionHostId: executionHostId ?? undefined,
    explicitCreation: explicit.explicitCreation,
    name: explicit.name,
    displayName: explicit.displayName,
    displayNameKind: 'user',
    nameWasGenerated: false,
    pendingFirstAgentMessageRename: false,
    baseBranch: explicit.baseBranch,
    branchNameOverride: explicit.explicitCreation.branch.name
  })
}
