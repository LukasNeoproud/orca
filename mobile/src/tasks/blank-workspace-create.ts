import type { TuiAgent } from '../../../src/shared/tui-agent'
import type { RpcClient } from '../transport/rpc-client'
import { createWorktreeWithNameRetry, type WorktreeCreateResult } from './worktree-create-retry'
import type { WorktreeCreateAgentLaunch } from './agent-launch-request'
import type { WorktreeCreateIdempotencyProbe } from './worktree-create-idempotency-policy'
import type { ExplicitWorktreeCreation } from '../../../src/shared/worktree/explicit-creation'
import {
  advancedWorkspaceCreateFields,
  startupAgentCreateFields,
  type WorkspaceCreateAdvancedOptions,
  type WorkspaceCreateParams,
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
  advanced?: WorkspaceCreateAdvancedOptions
  /** Whether the host can settle the surface itself; false keeps the agent-first create. */
  agentLaunchSupported: WorktreeCreateAgentLaunch['supported']
}): Promise<WorktreeCreateResult> {
  const agentLaunch: WorktreeCreateAgentLaunch | undefined = args.createdWithAgentId
    ? { agent: args.createdWithAgentId, supported: args.agentLaunchSupported }
    : undefined
  return createWorktreeWithNameRetry({
    client: args.client,
    baseName: args.baseName,
    nameWasGenerated: args.nameWasGenerated,
    worktreeCreateIdempotency: args.worktreeCreateIdempotency,
    recoverCompletedCheckoutFailure: args.recoverCompletedCheckoutFailure,
    createMethod: args.explicitCreation ? 'worktree.createExplicit' : 'worktree.create',
    maxAttempts: args.explicitCreation ? 1 : undefined,
    ...(agentLaunch ? { agentLaunch } : {}),
    buildParams: (name) => {
      const params: WorkspaceCreateParams = {
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
        ...startupAgentCreateFields(args.createdWithAgentId)
      }
      if (args.advanced) {
        Object.assign(params, advancedWorkspaceCreateFields(args.advanced))
      }
      if (args.comment) {
        params.comment = args.comment
      }
      return params
    }
  })
}
