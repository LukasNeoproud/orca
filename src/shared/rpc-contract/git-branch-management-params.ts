import { z } from 'zod'
import { WorktreeSelector } from './git-params'

export const GitManageBranchParams = WorktreeSelector.extend({
  action: z.enum(['switch', 'create', 'rename']),
  branch: z.string().min(1)
})
