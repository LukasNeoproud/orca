import { defineMethod } from '../core'
import { WorktreeCreate } from '../../../../shared/rpc-contract/worktree-create-params'
import { WORKTREE_METHODS } from './worktree'

// A distinct method refuses old hosts before they can strip explicit path semantics.
const legacyCreateMethod = WORKTREE_METHODS.find((method) => method.name === 'worktree.create')!

export const WORKTREE_EXPLICIT_CREATION_METHODS = [
  { ...legacyCreateMethod, name: 'worktree.createExplicit' as const },
  defineMethod({
    name: 'worktree.previewCreation',
    permission: 'workspace',
    params: WorktreeCreate,
    handler: (params, { runtime }) =>
      runtime.previewManagedWorktreeCreation({
        repoSelector: params.repo,
        name: params.name || '',
        baseBranch: params.baseBranch,
        explicitCreation: params.explicitCreation
      })
  }),
  defineMethod({
    name: 'worktree.ignoreCreationLocally',
    permission: 'workspace',
    params: WorktreeCreate,
    handler: (params, { runtime }) =>
      runtime.ignoreManagedWorktreeCreationLocally({
        repoSelector: params.repo,
        name: params.name || '',
        baseBranch: params.baseBranch,
        explicitCreation: params.explicitCreation
      })
  })
]
