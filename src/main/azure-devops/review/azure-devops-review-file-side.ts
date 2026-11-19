import type { AzureDevOpsReviewFileSide } from '../../../shared/azure-devops-review-types'
import type { RawReviewItem } from './azure-devops-review-client'

// Why: Monaco diffs past a couple of MB freeze the renderer; such files open on Azure DevOps instead.
const MAX_CONTENT_CHARS = 2_000_000

export function toAzureDevOpsReviewFileSide(item: RawReviewItem | null): AzureDevOpsReviewFileSide {
  if (!item) {
    return { content: '', missing: true, binary: false, tooLarge: false }
  }
  // Why the NUL check: hosts that omit content metadata still must not render bytes as text.
  if (item.contentMetadata?.isBinary === true || item.content?.includes('\u0000')) {
    return { content: '', missing: false, binary: true, tooLarge: false }
  }
  const content = item.content ?? ''
  return content.length > MAX_CONTENT_CHARS
    ? { content: '', missing: false, binary: false, tooLarge: true }
    : { content, missing: false, binary: false, tooLarge: false }
}
