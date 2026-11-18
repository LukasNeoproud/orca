import {
  GitDeleteBranchParams,
  GitDeleteMergedBranchesParams,
  GitMergedBranchesParams,
  GitRenameBranchParams
} from '../../../../shared/rpc-contract/git-branch-management-params'
import { WorktreeSelector } from '../../../../shared/rpc-contract/git-params'
import { defineMethod } from '../core'

export const GIT_BRANCH_LIST_METHODS = [
  defineMethod({
    name: 'git.branches',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.listRuntimeGitBranches(params.worktree)
  }),
  defineMethod({
    name: 'git.deleteBranch',
    permission: 'workspace',
    params: GitDeleteBranchParams,
    handler: async ({ worktree, ...request }, { runtime }) =>
      runtime.deleteRuntimeGitBranch(worktree, request)
  }),
  defineMethod({
    name: 'git.renameBranch',
    permission: 'workspace',
    params: GitRenameBranchParams,
    handler: async (params, { runtime }) =>
      runtime.renameRuntimeGitBranch(params.worktree, params.name, params.newName)
  }),
  defineMethod({
    name: 'git.mergedBranches',
    permission: 'workspace',
    params: GitMergedBranchesParams,
    handler: async (params, { runtime, signal }) =>
      runtime.listRuntimeMergedBranches(params.worktree, { target: params.target, signal })
  }),
  defineMethod({
    name: 'git.deleteMergedBranches',
    permission: 'workspace',
    params: GitDeleteMergedBranchesParams,
    handler: async (params, { runtime }) =>
      runtime.deleteRuntimeMergedBranches(params.worktree, params.branches, params.target)
  })
]
