import { z } from 'zod'
import type { GitBlameResult } from '../../../shared/git-blame'

// Why: the gutter writes commit ids into HTML, and a remote host's answer is not ours to trust.
// Only the fields the editor reads are pinned; fields a newer host adds pass through.
const commitId = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
const lineNumber = z.number().int().positive()
const count = z.number().int().nonnegative()

const gitBlameResult: z.ZodType<GitBlameResult> = z.object({
  status: z.enum(['ready', 'untracked', 'too-large']),
  ranges: z.array(
    z.object({ startLine: lineNumber, lineCount: count, commitId: z.string().nullable() })
  ),
  commits: z.array(
    z.object({
      id: commitId,
      displayId: z.string().regex(/^[0-9a-f]{4,64}$/),
      author: z.string(),
      authorEmail: z.string().optional(),
      timestamp: z.number(),
      subject: z.string()
    })
  ),
  lineCount: count
})

export function parseRuntimeGitBlameResult(value: unknown): GitBlameResult {
  const parsed = gitBlameResult.safeParse(value)
  if (!parsed.success) {
    throw new Error('The host answered with Git annotations Orca cannot read.')
  }
  return parsed.data
}
