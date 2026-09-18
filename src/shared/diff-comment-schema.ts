import { z } from 'zod'

export const DiffCommentSchema = z.object({
  id: z.string(),
  worktreeId: z.string(),
  filePath: z.string(),
  source: z.enum(['diff', 'markdown', 'image']).optional(),
  selectedText: z.string().optional(),
  imageRegion: z
    .object({
      x: z.number().finite().min(0).max(100),
      y: z.number().finite().min(0).max(100),
      width: z.number().finite().positive().max(100),
      height: z.number().finite().positive().max(100)
    })
    .optional(),
  startLine: z.number().int().positive().optional(),
  lineNumber: z.number().int().nonnegative(),
  body: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite().optional(),
  sentAt: z.number().finite().optional(),
  scope: z.enum(['unstaged', 'staged', 'branch']).optional(),
  oldPath: z.string().optional(),
  diffIdentity: z.string().optional(),
  side: z.literal('modified')
})
