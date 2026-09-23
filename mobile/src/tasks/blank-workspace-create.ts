import type { TuiAgent } from '../../../src/shared/tui-agent'
import type { RpcClient } from '../transport/rpc-client'
import { createWorktreeWithNameRetry, type WorktreeCreateResult } from './worktree-create-retry'
import type { WorktreeCreateIdempotencyProbe } from './worktree-create-idempotency-policy'
import type { ExplicitWorktreeCreation } from '../../../src/shared/worktree/explicit-creation'
import {
  agentLaunchCreateFields,
  type WorkspaceCreateSetupDecision
} from './workspace-create-params'

// The blank/named create path, extracted from NewWorktreeModal so the modal keeps
// only the UI-coupled setup-trust flow. Assembles worktree.create params and
// applies the shared name-collision retry.
export async function createBlankWorkspace(args: {
  client: RpcClient
  repoId: string
  baseName: string
  createdWithAgentId: TuiAgent | undefined
  comment: string | undefined
  branchNameOverride?: string
  setupDecision: WorkspaceCreateSetupDecision
  /** True when `baseName` is a generated creature name rather than one the user typed; only then
   *  may the host retire it. */
  nameWasGenerated: boolean
  worktreeCreateIdempotency: WorktreeCreateIdempotencyProbe
  recoverCompletedCheckoutFailure?: boolean
  explicitCreation?: ExplicitWorktreeCreation
}): Promise<WorktreeCreateResult> {
  return createWorktreeWithNameRetry({
    client: args.client,
    baseName: args.baseName,
    nameWasGenerated: args.nameWasGenerated,
    worktreeCreateIdempotency: args.worktreeCreateIdempotency,
    recoverCompletedCheckoutFailure: args.recoverCompletedCheckoutFailure,
    createMethod: args.explicitCreation ? 'worktree.createExplicit' : 'worktree.create',
    maxAttempts: args.explicitCreation ? 1 : undefined,
    buildParams: (name) => {
      const params: Record<string, unknown> = {
        repo: `id:${args.repoId}`,
        setupDecision: args.setupDecision,
        name,
        ...(args.branchNameOverride?.trim()
          ? { branchNameOverride: args.branchNameOverride.trim() }
          : {}),
        ...(args.explicitCreation ? { explicitCreation: args.explicitCreation } : {}),
        ...(args.nameWasGenerated
          ? { displayNameKind: 'generated' as const }
          : { displayName: args.baseName, displayNameKind: 'user' as const }),
        ...(args.nameWasGenerated ? { nameWasGenerated: true } : {}),
        ...agentLaunchCreateFields(args.createdWithAgentId)
      }
      if (args.comment) {
        params.comment = args.comment
      }
      return params
    }
  })
}
