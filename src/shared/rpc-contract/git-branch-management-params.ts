import { z } from 'zod'
import { GIT_MERGED_BRANCH_DELETE_LIMIT } from '../git-merged-branch-cleanup'
import { WorktreeSelector } from './git-params'

export const GitManageBranchParams = WorktreeSelector.extend({
  action: z.enum(['switch', 'create', 'rename']),
  branch: z.string().min(1)
})

const mergedBranchTarget = z
  .string()
  .regex(/^refs\/remotes\/origin\/[^\s]+$/)
  .max(300)
  .optional()

export const GitMergedBranchesParams = WorktreeSelector.extend({ target: mergedBranchTarget })

export const GitDeleteMergedBranchesParams = WorktreeSelector.extend({
  target: mergedBranchTarget,
  branches: z
    .array(
      z.object({
        name: z.string().min(1),
        head: z.string().regex(/^[0-9a-f]{40,64}$/),
        deleteRemote: z.boolean().optional()
      })
    )
    .min(1)
    .max(GIT_MERGED_BRANCH_DELETE_LIMIT)
})

export const GitDeleteBranchParams = WorktreeSelector.extend({
  kind: z.enum(['local', 'remote']),
  name: z.string().min(1).max(300),
  head: z.string().regex(/^[0-9a-f]{40,64}$/),
  deleteRemote: z.boolean().optional()
})

export const GitRenameBranchParams = WorktreeSelector.extend({
  name: z.string().min(1).max(300),
  newName: z.string().min(1).max(300)
})
