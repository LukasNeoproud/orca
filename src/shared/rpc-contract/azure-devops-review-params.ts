import { z } from 'zod'
import { normalizeAzureDevOpsReviewOptions } from '../azure-devops-review-options'
import {
  AZURE_DEVOPS_REVIEW_THREAD_STATUSES,
  type AzureDevOpsThreadStatus
} from '../azure-devops-review-types'

const PullRequestKey = z.string().min(3).max(512)
const ThreadStatus = z
  .string()
  .refine((value) => (AZURE_DEVOPS_REVIEW_THREAD_STATUSES as readonly string[]).includes(value))
  .transform((value) => value as AzureDevOpsThreadStatus)
const Anchor = z.object({
  side: z.enum(['right', 'left']).optional().default('right'),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive().optional()
})
const NormalizedAnchor = Anchor.transform((anchor) => ({
  side: anchor.side,
  startLine: anchor.startLine,
  endLine: Math.max(anchor.startLine, anchor.endLine ?? anchor.startLine)
}))
const Author = z.union([
  z.object({ kind: z.literal('user') }),
  z.object({ kind: z.literal('agent'), label: z.string().max(120).nullable().optional() })
])

export const AzureDevOpsReviewListParams = z
  .object({ status: z.enum(['active', 'completed', 'abandoned', 'all']).optional() })
  .nullish()
  .transform((value) => ({ status: value?.status ?? 'active' }))

export const AzureDevOpsReviewKeyParams = z.object({ pullRequestKey: PullRequestKey })

export const AzureDevOpsReviewCreateDraftParams = z.object({
  pullRequestKey: PullRequestKey,
  kind: z.enum(['inline', 'file', 'general', 'reply']),
  body: z.string().max(64_000),
  filePath: z.string().max(4096).nullable().optional(),
  anchor: NormalizedAnchor.nullable().optional(),
  threadId: z.number().int().positive().nullable().optional(),
  threadStatus: ThreadStatus.nullable().optional(),
  author: Author.optional(),
  commit: z.string().max(64).nullable().optional()
})

export const AzureDevOpsReviewUpdateDraftParams = z.object({
  id: z.string().min(1).max(128),
  patch: z.object({
    body: z.string().max(64_000).optional(),
    filePath: z.string().max(4096).nullable().optional(),
    anchor: NormalizedAnchor.nullable().optional(),
    threadStatus: ThreadStatus.nullable().optional(),
    rebaseToLatest: z.boolean().optional()
  })
})

export const AzureDevOpsReviewFileDiffParams = z.object({
  pullRequestKey: PullRequestKey,
  path: z.string().min(1).max(4096),
  originalPath: z.string().max(4096).nullable().optional()
})

export const AzureDevOpsReviewDeleteDraftParams = z.object({ id: z.string().min(1).max(128) })

export const AzureDevOpsReviewPublishParams = z.object({
  pullRequestKey: PullRequestKey,
  draftIds: z.array(z.string().min(1).max(128)).min(1).max(200)
})

export const AzureDevOpsReviewOpenWorktreeParams = z.object({
  pullRequestKey: PullRequestKey,
  discardChanges: z.boolean().optional()
})

const ReviewOptions = z.unknown().transform((value) => normalizeAzureDevOpsReviewOptions(value))

export const AzureDevOpsReviewRunAgentParams = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('review'),
    pullRequestKey: PullRequestKey,
    discardChanges: z.boolean().optional(),
    options: ReviewOptions
  }),
  z.object({
    kind: z.literal('rework'),
    pullRequestKey: PullRequestKey,
    discardChanges: z.boolean().optional(),
    items: z
      .array(z.object({ draftId: z.string().min(1).max(128), instruction: z.string().max(16_000) }))
      .min(1)
      .max(200),
    generalInstruction: z.string().max(16_000),
    options: ReviewOptions.optional()
  })
])
