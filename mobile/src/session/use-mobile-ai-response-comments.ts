import { useCallback, useRef, useState } from 'react'
import type { AiResponseComment } from '../../../src/shared/ai-response-comments'

const NO_COMMENTS: AiResponseComment[] = []

export function useMobileAiResponseComments(scopeKey: string | null) {
  const [commentsByScope, setCommentsByScope] = useState<Record<string, AiResponseComment[]>>({})
  const counterRef = useRef(0)

  const update = useCallback(
    (transform: (comments: readonly AiResponseComment[]) => AiResponseComment[]) => {
      if (!scopeKey) {
        return
      }
      setCommentsByScope((previous) => {
        const nextComments = transform(previous[scopeKey] ?? NO_COMMENTS)
        return { ...previous, [scopeKey]: nextComments }
      })
    },
    [scopeKey]
  )

  const addComment = useCallback(
    (quote: string, comment: string): AiResponseComment | null => {
      const normalizedComment = comment.trim()
      if (!quote.trim() || !normalizedComment) {
        return null
      }
      counterRef.current += 1
      const value: AiResponseComment = {
        id: `mobile-response-comment-${Date.now()}-${counterRef.current}`,
        quote,
        comment: normalizedComment
      }
      update((comments) => [...comments, value])
      return value
    },
    [update]
  )

  const updateComment = useCallback(
    (value: AiResponseComment) => {
      update((comments) => comments.map((comment) => (comment.id === value.id ? value : comment)))
    },
    [update]
  )

  const deleteComment = useCallback(
    (id: string) => update((comments) => comments.filter((comment) => comment.id !== id)),
    [update]
  )

  const clearComments = useCallback(
    (sent?: readonly AiResponseComment[]) => {
      update((comments) => {
        if (!sent) {
          return []
        }
        const sentById = new Map(sent.map((comment) => [comment.id, comment]))
        return comments.filter((comment) => {
          const snapshot = sentById.get(comment.id)
          return (
            !snapshot || snapshot.quote !== comment.quote || snapshot.comment !== comment.comment
          )
        })
      })
    },
    [update]
  )

  const comments = scopeKey ? (commentsByScope[scopeKey] ?? NO_COMMENTS) : NO_COMMENTS
  const commentsRef = useRef(comments)
  commentsRef.current = comments

  return { comments, commentsRef, addComment, updateComment, deleteComment, clearComments }
}
