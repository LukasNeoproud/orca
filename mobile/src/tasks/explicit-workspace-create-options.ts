import type { ExplicitWorktreeCreation } from '../../../src/shared/worktree/explicit-creation'
import type { WorkspaceCreateAdvancedOptions } from './workspace-create-params'

export type ExplicitWorkspaceCreateOptions = {
  recoverCompletedCheckoutFailure?: boolean
  explicitCreation?: ExplicitWorktreeCreation
  advanced?: WorkspaceCreateAdvancedOptions
}

/** An explicit location uses its own method and must not retry under another name. */
export function explicitCreateRetryOptions(args: ExplicitWorkspaceCreateOptions): {
  recoverCompletedCheckoutFailure?: boolean
  createMethod: 'worktree.create' | 'worktree.createExplicit'
  maxAttempts?: number
} {
  return {
    recoverCompletedCheckoutFailure: args.recoverCompletedCheckoutFailure,
    createMethod: args.explicitCreation ? 'worktree.createExplicit' : 'worktree.create',
    ...(args.explicitCreation ? { maxAttempts: 1 } : {})
  }
}

export function explicitCreationParams(args: ExplicitWorkspaceCreateOptions): {
  explicitCreation?: ExplicitWorktreeCreation
} {
  return args.explicitCreation ? { explicitCreation: args.explicitCreation } : {}
}
