import type { DiffComment, DiffCommentSource } from '../../../shared/diff-comment-types'

export function getDiffCommentSource(comment: Pick<DiffComment, 'source'>): DiffCommentSource {
  return comment.source === 'markdown' || comment.source === 'image' ? comment.source : 'diff'
}

export function isDiffComment(comment: Pick<DiffComment, 'source'>): boolean {
  return getDiffCommentSource(comment) === 'diff'
}

export function isMarkdownComment(comment: Pick<DiffComment, 'source'>): boolean {
  return getDiffCommentSource(comment) === 'markdown'
}

export function isImageComment(comment: Pick<DiffComment, 'source'>): boolean {
  return getDiffCommentSource(comment) === 'image'
}

export function getDiffCommentLineLabel(
  comment: Pick<DiffComment, 'lineNumber' | 'startLine' | 'source'>,
  compact = false
): string {
  if (comment.source === 'image') {
    return compact ? 'Area' : 'Image area'
  }
  if (comment.lineNumber === 0) {
    return compact ? 'File' : 'Whole file'
  }
  if (comment.startLine !== undefined && comment.startLine !== comment.lineNumber) {
    return compact
      ? `L${comment.startLine}-L${comment.lineNumber}`
      : `Lines ${comment.startLine}-${comment.lineNumber}`
  }
  return compact ? `L${comment.lineNumber}` : `Line ${comment.lineNumber}`
}
