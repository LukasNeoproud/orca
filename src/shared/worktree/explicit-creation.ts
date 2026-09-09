import { z } from 'zod'

export const ExplicitWorktreeCreationSchema = z.object({
  branch: z.object({
    kind: z.enum(['new', 'local', 'remote']),
    name: z.string().min(1),
    remoteRef: z.string().min(1).optional()
  }),
  destination: z.object({
    root: z.string().min(1).optional(),
    relativeDirectory: z.string().min(1)
  })
})

export type ExplicitWorktreeCreation = z.infer<typeof ExplicitWorktreeCreationSchema>
export type WorktreeCreationPreview = {
  branch: ExplicitWorktreeCreation['branch']
  baseBranch: string
  path: string
  occupyingWorktree?: { path: string; branch: string }
  destinationExists: boolean
  needsLocalIgnore: boolean
}
