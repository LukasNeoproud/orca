import type { ReactNode } from 'react'
import type { DiffComment } from '../../../../shared/diff-comment-types'

export type DecoratedDiffComment = DiffComment & {
  author?: string
  authorAvatarUrl?: string
  createdAtLabel?: string
  url?: string
  canDelete?: boolean
  canEdit?: boolean
}

/** Edit/delete/extra card actions for inline comments a surface owns instead of local notes. */
export type InlineDiffCommentActions = {
  onDelete?: (commentId: string) => void
  onUpdate?: (commentId: string, body: string) => Promise<boolean>
  renderHeaderActions?: (comment: DecoratedDiffComment) => ReactNode
}
