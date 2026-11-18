import { z } from 'zod'
import { GIT_BLAME_MAX_CONTENT_LENGTH } from '../git-blame'
import { GIT_LINE_HISTORY_MAX_LIMIT } from '../git-line-history'
import { WorktreeSelector } from './git-params'

const AnnotatedFile = WorktreeSelector.extend({
  relativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing relative path'))
})

export const GitBlame = AnnotatedFile.extend({
  // Why above the annotate bound: larger text gets the host's `too-large` answer, not a schema error.
  contents: z.string().max(GIT_BLAME_MAX_CONTENT_LENGTH * 2)
})

export const GitLineHistory = AnnotatedFile.extend({
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  limit: z.number().int().min(1).max(GIT_LINE_HISTORY_MAX_LIMIT).optional()
})
