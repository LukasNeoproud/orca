import type { DiffComment, ImageReviewRegion } from '../../../src/shared/diff-comment-types'
import { normalizeMobileImageRegion } from './mobile-diff-comments'

export type UpdateMobileDiffCommentInput = {
  id: string
  body: string
  updatedAt: number
  imageRegion?: ImageReviewRegion
}

export function updateMobileDiffComment(
  comments: readonly DiffComment[],
  input: UpdateMobileDiffCommentInput
): { comments: DiffComment[]; comment: DiffComment | null } {
  const body = input.body.trim()
  if (!body) {
    return { comments: [...comments], comment: null }
  }
  let updatedComment: DiffComment | null = null
  const next = comments.map((comment) => {
    if (comment.id !== input.id) {
      return comment
    }
    updatedComment = {
      ...comment,
      body,
      ...(input.imageRegion && comment.source === 'image'
        ? { imageRegion: normalizeMobileImageRegion(input.imageRegion) ?? comment.imageRegion }
        : {}),
      updatedAt: input.updatedAt,
      sentAt: undefined
    }
    return updatedComment
  })
  return { comments: next, comment: updatedComment }
}

export function markMobileDiffCommentsSent(
  comments: readonly DiffComment[],
  ids: ReadonlySet<string>,
  sentAt: number
): DiffComment[] {
  if (ids.size === 0) {
    return [...comments]
  }
  return comments.map((comment) => (ids.has(comment.id) ? { ...comment, sentAt } : comment))
}

export function clearSentMobileDiffComments(comments: readonly DiffComment[]): DiffComment[] {
  return comments.filter((comment) => comment.sentAt === undefined)
}

export function getUnsentMobileDiffComments(comments: readonly DiffComment[]): DiffComment[] {
  return comments.filter((comment) => comment.sentAt === undefined)
}

export function countUnsentMobileDiffComments(comments: readonly DiffComment[]): number {
  return getUnsentMobileDiffComments(comments).length
}
