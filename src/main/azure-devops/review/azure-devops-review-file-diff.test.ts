import { describe, expect, it } from 'vitest'
import {
  azureDevOpsReviewImageMimeType,
  toAzureDevOpsReviewFileSide,
  toAzureDevOpsReviewImageSide
} from './azure-devops-review-file-diff'
import { compareAzureDevOpsReviewPullRequestsNewestFirst } from './azure-devops-review-service'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

describe('toAzureDevOpsReviewFileSide', () => {
  it('distinguishes missing, binary, oversized and text content', () => {
    expect(toAzureDevOpsReviewFileSide(null)).toMatchObject({ missing: true, content: '' })
    expect(toAzureDevOpsReviewFileSide({ contentMetadata: { isBinary: true } })).toMatchObject({
      binary: true
    })
    expect(toAzureDevOpsReviewFileSide({ content: 'x'.repeat(2_000_001) })).toMatchObject({
      tooLarge: true,
      content: ''
    })
    expect(toAzureDevOpsReviewFileSide({ content: 'a\nb' })).toEqual({
      content: 'a\nb',
      missing: false,
      binary: false,
      tooLarge: false
    })
  })

  it('treats content with NUL bytes as binary when metadata is missing', () => {
    expect(toAzureDevOpsReviewFileSide({ content: 'PNG\u0000\u0001' })).toMatchObject({
      binary: true,
      content: ''
    })
  })
})

describe('azureDevOpsReviewImageMimeType', () => {
  it('previews raster images only', () => {
    expect(azureDevOpsReviewImageMimeType('assets/Logo.PNG')).toBe('image/png')
    expect(azureDevOpsReviewImageMimeType('a/photo.jpeg')).toBe('image/jpeg')
    expect(azureDevOpsReviewImageMimeType('icon.svg')).toBeNull()
    expect(azureDevOpsReviewImageMimeType('doc.pdf')).toBeNull()
    expect(azureDevOpsReviewImageMimeType('lib.dll')).toBeNull()
  })
})

describe('toAzureDevOpsReviewImageSide', () => {
  it('carries image bytes as base64 with their MIME type', () => {
    expect(
      toAzureDevOpsReviewImageSide({ kind: 'bytes', bytes: Buffer.from([1, 2, 3]) }, 'image/png')
    ).toEqual({
      content: 'AQID',
      missing: false,
      binary: true,
      tooLarge: false,
      imageMimeType: 'image/png'
    })
    expect(toAzureDevOpsReviewImageSide({ kind: 'missing' }, 'image/png')).toMatchObject({
      missing: true
    })
    expect(toAzureDevOpsReviewImageSide({ kind: 'too-large' }, 'image/png')).toMatchObject({
      tooLarge: true,
      content: ''
    })
  })
})

describe('compareAzureDevOpsReviewPullRequestsNewestFirst', () => {
  const pr = (pullRequestId: number, createdAt: string) =>
    ({ pullRequestId, createdAt }) as AzureDevOpsReviewPullRequest

  it('orders by creation date, newest first, with PR id breaking ties', () => {
    const sorted = [
      pr(1, '2025-12-01T00:00:00Z'),
      pr(3, '2026-06-02T00:00:00Z'),
      pr(2, '2026-06-02T00:00:00Z'),
      pr(9, '')
    ].sort(compareAzureDevOpsReviewPullRequestsNewestFirst)
    expect(sorted.map((item) => item.pullRequestId)).toEqual([3, 2, 1, 9])
  })
})
