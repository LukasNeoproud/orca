import type {
  AzureDevOpsReviewFileDiff,
  AzureDevOpsReviewFileDiffParams,
  AzureDevOpsReviewFileSide
} from '../../../shared/azure-devops-review-types'
import { getAzureDevOpsReviewItemAtCommit, type RawReviewItem } from './azure-devops-review-client'
import { toAzureDevOpsItemPath } from './azure-devops-review-mappers'
import {
  latestAzureDevOpsReviewIteration,
  loadAzureDevOpsReviewIterations,
  resolveAzureDevOpsReviewPullRequest,
  type AzureDevOpsReviewHost
} from './azure-devops-review-service'

// Why: Monaco diffs past a couple of MB freeze the renderer; such files open on Azure DevOps instead.
const MAX_CONTENT_CHARS = 2_000_000

export function toAzureDevOpsReviewFileSide(item: RawReviewItem | null): AzureDevOpsReviewFileSide {
  if (!item) {
    return { content: '', missing: true, binary: false, tooLarge: false }
  }
  if (item.contentMetadata?.isBinary === true) {
    return { content: '', missing: false, binary: true, tooLarge: false }
  }
  const content = item.content ?? ''
  return content.length > MAX_CONTENT_CHARS
    ? { content: '', missing: false, binary: false, tooLarge: true }
    : { content, missing: false, binary: false, tooLarge: false }
}

/** Both sides of one file as the PR's Files view shows it: merge base vs latest iteration. */
export async function getAzureDevOpsReviewFileDiff(
  host: AzureDevOpsReviewHost,
  params: AzureDevOpsReviewFileDiffParams
): Promise<AzureDevOpsReviewFileDiff> {
  const resolved = await resolveAzureDevOpsReviewPullRequest(host, params.pullRequestKey)
  const latest = latestAzureDevOpsReviewIteration(
    await loadAzureDevOpsReviewIterations(resolved.target)
  )
  if (!latest?.sourceCommit) {
    throw new Error('The pull request has no iterations to compare yet.')
  }
  const baseCommit = latest.baseCommit ?? latest.targetCommit
  const target = { ...resolved.source, repositoryId: resolved.target.repositoryId }
  const [original, modified] = await Promise.all([
    baseCommit
      ? getAzureDevOpsReviewItemAtCommit(
          target,
          toAzureDevOpsItemPath(params.originalPath || params.path),
          baseCommit
        )
      : Promise.resolve(null),
    getAzureDevOpsReviewItemAtCommit(
      target,
      toAzureDevOpsItemPath(params.path),
      latest.sourceCommit
    )
  ])
  return {
    iterationId: latest.id,
    original: toAzureDevOpsReviewFileSide(original),
    modified: toAzureDevOpsReviewFileSide(modified)
  }
}
