import type { DiffComment, ImageReviewRegion } from './diff-comment-types'

const REGION_PREFIX = 'orca:image-region:v1:'

function validRegion(region: ImageReviewRegion): boolean {
  return (
    Object.values(region).every(Number.isFinite) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 100 &&
    region.y + region.height <= 100
  )
}

export function encodeImageReviewCommentForLegacyHost(comment: DiffComment): DiffComment {
  if (comment.source !== 'image' || !comment.imageRegion) {
    return comment
  }
  const { imageRegion: _region, ...rest } = comment
  return {
    ...rest,
    source: 'diff',
    lineNumber: 1,
    selectedText: `${REGION_PREFIX}${JSON.stringify(comment.imageRegion)}`
  }
}

export function decodeImageReviewCommentFromLegacyHost(comment: DiffComment): DiffComment {
  if (!comment || comment.source !== 'diff' || !comment.selectedText?.startsWith(REGION_PREFIX)) {
    return comment
  }
  try {
    const region = JSON.parse(comment.selectedText.slice(REGION_PREFIX.length)) as ImageReviewRegion
    if (!validRegion(region)) {
      return comment
    }
    return {
      ...comment,
      source: 'image',
      imageRegion: region,
      selectedText: undefined,
      lineNumber: 0
    }
  } catch {
    return comment
  }
}

const decodedLists = new WeakMap<DiffComment[], DiffComment[]>()

export function decodeImageReviewCommentsFromLegacyHost(comments: DiffComment[]): DiffComment[] {
  const cached = decodedLists.get(comments)
  if (cached) {
    return cached
  }
  const decoded = comments.map(decodeImageReviewCommentFromLegacyHost)
  const result = decoded.every((comment, index) => comment === comments[index]) ? comments : decoded
  decodedLists.set(comments, result)
  return result
}
