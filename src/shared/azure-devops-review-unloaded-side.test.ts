import { describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewChangeType,
  AzureDevOpsReviewFileSide
} from './azure-devops-review-types'
import { azureDevOpsReviewUnloadedSide } from './azure-devops-review-unloaded-side'

/** null: the host reported the side missing. */
function side(content: string | null): AzureDevOpsReviewFileSide {
  return { content: content ?? '', missing: content === null, binary: false, tooLarge: false }
}

describe('azureDevOpsReviewUnloadedSide', () => {
  it.each<
    [AzureDevOpsReviewChangeType, string | null, string | null, 'original' | 'modified' | null]
  >([
    ['edit', null, 'b', 'original'],
    ['rename', null, 'b', 'original'],
    ['delete', null, null, 'original'],
    ['edit', 'a', null, 'modified'],
    ['add', null, null, 'modified'],
    ['rename', 'a', null, 'modified'],
    ['add', null, 'b', null],
    ['delete', 'a', null, null],
    ['edit', '', 'b', null],
    ['edit', 'a', '', null],
    ['other', null, null, null]
  ])('%s with original %j and modified %j -> %s', (changeType, original, modified, expected) => {
    const diff = { iterationId: 1, original: side(original), modified: side(modified) }
    expect(azureDevOpsReviewUnloadedSide(changeType, diff)).toBe(expected)
  })
})
