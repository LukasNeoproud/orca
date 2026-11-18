import { GitBlame, GitLineHistory } from '../../../../shared/rpc-contract/git-annotate-params'
import { defineMethod } from '../core'

export const GIT_ANNOTATE_METHODS = [
  defineMethod({
    name: 'git.blame',
    permission: 'workspace',
    params: GitBlame,
    handler: async (params, { runtime }) =>
      runtime.getRuntimeGitBlame(params.worktree, params.relativePath, params.contents)
  }),
  defineMethod({
    name: 'git.lineHistory',
    permission: 'workspace',
    params: GitLineHistory,
    handler: async (params, { runtime }) =>
      runtime.getRuntimeGitLineHistory(
        params.worktree,
        params.relativePath,
        { startLine: params.startLine, endLine: params.endLine },
        params.limit
      )
  })
]
