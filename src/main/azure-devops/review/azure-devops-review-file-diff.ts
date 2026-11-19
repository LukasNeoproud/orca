import type {
  AzureDevOpsReviewFileDiff,
  AzureDevOpsReviewFileDiffParams,
  AzureDevOpsReviewFileSide
} from '../../../shared/azure-devops-review-types'
import { extname } from 'node:path'
import {
  getAzureDevOpsReviewItemAtCommit,
  getAzureDevOpsReviewItemBytesAtCommit,
  type RawReviewItemBytes
} from './azure-devops-review-client'
import { toAzureDevOpsReviewFileSide } from './azure-devops-review-file-side'
import { PREVIEWABLE_BINARY_MIME_TYPES } from '../../git/source-control/previewable-binary-mime-types'
import { isKnownRasterImageMimeType } from '../../../shared/raster-image-preview-limits'
import { toAzureDevOpsItemPath } from './azure-devops-review-mappers'
import {
  latestAzureDevOpsReviewIteration,
  loadAzureDevOpsReviewIterations,
  resolveAzureDevOpsReviewPullRequest,
  type AzureDevOpsReviewHost
} from './azure-devops-review-service'

// Why: images travel as base64 to the renderer, which grows them by a third.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export { toAzureDevOpsReviewFileSide }

/** The raster image MIME type for a path; SVG stays a text diff and other binaries are not shown. */
export function azureDevOpsReviewImageMimeType(path: string): string | null {
  const mimeType = PREVIEWABLE_BINARY_MIME_TYPES[extname(path).toLowerCase()]
  return mimeType && isKnownRasterImageMimeType(mimeType) ? mimeType : null
}

export function toAzureDevOpsReviewImageSide(
  item: RawReviewItemBytes,
  mimeType: string
): AzureDevOpsReviewFileSide {
  switch (item.kind) {
    case 'missing':
      return { content: '', missing: true, binary: false, tooLarge: false }
    case 'too-large':
      return { content: '', missing: false, binary: true, tooLarge: true }
    case 'bytes':
      return {
        content: item.bytes.toString('base64'),
        missing: false,
        binary: true,
        tooLarge: false,
        imageMimeType: mimeType
      }
  }
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
  const originalPath = toAzureDevOpsItemPath(params.originalPath || params.path)
  const modifiedPath = toAzureDevOpsItemPath(params.path)
  const imageMimeType = azureDevOpsReviewImageMimeType(params.path)
  if (imageMimeType) {
    const [original, modified] = await Promise.all([
      baseCommit
        ? getAzureDevOpsReviewItemBytesAtCommit(target, originalPath, baseCommit, MAX_IMAGE_BYTES)
        : Promise.resolve({ kind: 'missing' as const }),
      getAzureDevOpsReviewItemBytesAtCommit(
        target,
        modifiedPath,
        latest.sourceCommit,
        MAX_IMAGE_BYTES
      )
    ])
    return {
      iterationId: latest.id,
      original: toAzureDevOpsReviewImageSide(original, imageMimeType),
      modified: toAzureDevOpsReviewImageSide(modified, imageMimeType)
    }
  }
  const [original, modified] = await Promise.all([
    baseCommit
      ? getAzureDevOpsReviewItemAtCommit(target, originalPath, baseCommit)
      : Promise.resolve(null),
    getAzureDevOpsReviewItemAtCommit(target, modifiedPath, latest.sourceCommit)
  ])
  return {
    iterationId: latest.id,
    original: toAzureDevOpsReviewFileSide(original),
    modified: toAzureDevOpsReviewFileSide(modified)
  }
}
