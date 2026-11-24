import type { AzureDevOpsPullRequestActivity } from '../../../shared/azure-devops-pull-request-work-facts'
import {
  mapAzureDevOpsThreadStatus,
  type RawIteration,
  type RawReviewThread
} from './azure-devops-review-mappers'

type RawComment = NonNullable<RawReviewThread['comments']>[number]

const BLOCKING_VOTES = new Set(['-5', '-10'])

function isSystem(comment: RawComment): boolean {
  const type = comment.commentType
  return type === 'system' || type === 2 || type === 'codeChange'
}

function later(a: string | null, b: string | null | undefined): string | null {
  if (!b || Number.isNaN(Date.parse(b))) {
    return a
  }
  return a === null || Date.parse(b) > Date.parse(a) ? b : a
}

function isBlockingVote(thread: RawReviewThread): boolean {
  const properties = thread.properties
  return (
    properties?.CodeReviewThreadType?.$value === 'VoteUpdate' &&
    BLOCKING_VOTES.has(String(properties.CodeReviewVoteResult?.$value))
  )
}

/** When the newest iteration was pushed; null when Azure DevOps dated none. */
export function azureDevOpsLastVersionAt(iterations: readonly RawIteration[]): string | null {
  return iterations.reduce<string | null>(
    (found, iteration) => later(found, iteration.createdDate),
    null
  )
}

/**
 * What the threads and iterations of an open pull request say about whose turn it is. `meId` is
 * the signed-in identity: its own comments and threads are not feedback.
 */
export function deriveAzureDevOpsPullRequestActivity(input: {
  threads: readonly RawReviewThread[]
  lastVersionAt: string | null
  meId: string
  readAt: string
}): AzureDevOpsPullRequestActivity {
  const me = input.meId.toLowerCase()
  const byOther = (comment: RawComment): boolean => comment.author?.id?.toLowerCase() !== me
  let unresolvedThreads = 0
  let lastFeedbackAt: string | null = null
  for (const thread of input.threads) {
    if (thread.isDeleted === true) {
      continue
    }
    const comments = (thread.comments ?? []).filter((comment) => comment.isDeleted !== true)
    const written = comments.filter((comment) => !isSystem(comment))
    for (const comment of written.filter(byOther)) {
      lastFeedbackAt = later(lastFeedbackAt, comment.publishedDate)
    }
    if (isBlockingVote(thread)) {
      for (const comment of comments.filter(byOther)) {
        lastFeedbackAt = later(lastFeedbackAt, comment.publishedDate)
      }
    }
    const status = mapAzureDevOpsThreadStatus(thread.status)
    const first = written.reduce<RawComment | undefined>(
      (found, comment) => (!found || (comment.id ?? 0) < (found.id ?? 0) ? comment : found),
      undefined
    )
    if (first && byOther(first) && (status === 'active' || status === 'pending')) {
      unresolvedThreads += 1
    }
  }
  return {
    lastVersionAt: input.lastVersionAt,
    unresolvedThreads,
    lastFeedbackAt,
    readAt: input.readAt
  }
}
