import { useCallback, useMemo, useRef, useState } from 'react'
import {
  appendAiResponseComments,
  formatAiResponseComments,
  type AiResponseComment
} from '../../../../shared/ai-response-comments'
import {
  appendNativeChatResponseComment,
  readNativeChatDraftCache,
  readNativeChatResponseComments,
  writeNativeChatDraftCache,
  writeNativeChatResponseComments
} from './native-chat-draft-cache'

/**
 * Composer draft state backed by the scope cache so a typed-but-unsent message
 * survives the composer unmounting on a TUI/GUI toggle. `scopeKey` is the stable
 * pane key also used for image attachments; when it changes (the composer is
 * reused for a different pane) the cached draft is reloaded.
 */
export function useNativeChatDraft(scopeKey: string): {
  draft: string
  setDraft: (next: string | ((previous: string) => string)) => void
  responseCommentDraft: {
    comments: readonly AiResponseComment[]
    add: (quote: string, comment: string) => boolean
    clear: () => void
    clearSubmitted: (submitted: readonly AiResponseComment[]) => void
    restoreCanceledSend: (draft: string, comments: readonly AiResponseComment[]) => void
    update: (id: string, comment: string) => void
    remove: (id: string) => void
    formattedDraft: string
    hasValidComments: boolean
  }
} {
  const [draft, setDraftState] = useState(() => readNativeChatDraftCache(scopeKey))
  const [responseComments, setResponseCommentsState] = useState(() =>
    readNativeChatResponseComments(scopeKey)
  )

  // Reload the cached draft when reused for a different pane (scope change),
  // adjusting state during render rather than in an effect so the restored draft
  // is visible on the first paint after the switch.
  const lastScopeKey = useRef(scopeKey)
  if (lastScopeKey.current !== scopeKey) {
    lastScopeKey.current = scopeKey
    setDraftState(readNativeChatDraftCache(scopeKey))
    setResponseCommentsState(readNativeChatResponseComments(scopeKey))
  }

  // Persist every mutation through the cache. Accepts the same value/updater
  // forms as a useState setter so call sites are drop-in.
  const setDraft = useCallback(
    (next: string | ((previous: string) => string)) => {
      if (lastScopeKey.current !== scopeKey) {
        const previous = readNativeChatDraftCache(scopeKey)
        writeNativeChatDraftCache(scopeKey, typeof next === 'function' ? next(previous) : next)
        return
      }
      setDraftState((previous) => {
        const resolved = typeof next === 'function' ? next(previous) : next
        writeNativeChatDraftCache(scopeKey, resolved)
        return resolved
      })
    },
    [scopeKey]
  )

  const setResponseComments = useCallback(
    (
      next:
        | readonly AiResponseComment[]
        | ((previous: readonly AiResponseComment[]) => readonly AiResponseComment[])
    ) => {
      if (lastScopeKey.current !== scopeKey) {
        const previous = readNativeChatResponseComments(scopeKey)
        writeNativeChatResponseComments(
          scopeKey,
          typeof next === 'function' ? next(previous) : next
        )
        return
      }
      setResponseCommentsState((previous) => {
        const resolved = typeof next === 'function' ? next(previous) : next
        writeNativeChatResponseComments(scopeKey, resolved)
        return resolved
      })
    },
    [scopeKey]
  )

  const addResponseComment = useCallback(
    (quote: string, comment: string): boolean => {
      if (!quote.trim() || !comment.trim()) {
        return false
      }
      const entry = appendNativeChatResponseComment(scopeKey, quote, comment)
      if (lastScopeKey.current === scopeKey) {
        setResponseCommentsState((current) => [...current, entry])
      }
      return true
    },
    [scopeKey]
  )
  const clearResponseComments = useCallback(() => setResponseComments([]), [setResponseComments])
  const clearSubmittedResponseComments = useCallback(
    (submitted: readonly AiResponseComment[]) =>
      setResponseComments((current) =>
        current.filter(
          (entry) =>
            !submitted.some(
              (sent) =>
                sent.id === entry.id && sent.quote === entry.quote && sent.comment === entry.comment
            )
        )
      ),
    [setResponseComments]
  )
  const restoreCanceledSend = useCallback(
    (submittedDraft: string, submittedComments: readonly AiResponseComment[]) => {
      const cachedDraft = readNativeChatDraftCache(scopeKey)
      if (!cachedDraft && submittedDraft) {
        writeNativeChatDraftCache(scopeKey, submittedDraft)
      }
      const mergeComments = (
        current: readonly AiResponseComment[]
      ): readonly AiResponseComment[] => {
        const currentIds = new Set(current.map((entry) => entry.id))
        return [...submittedComments.filter((entry) => !currentIds.has(entry.id)), ...current]
      }
      const restoredComments = mergeComments(readNativeChatResponseComments(scopeKey))
      writeNativeChatResponseComments(scopeKey, restoredComments)
      if (lastScopeKey.current === scopeKey) {
        setDraftState((current) => current || submittedDraft)
        setResponseCommentsState(mergeComments)
      }
    },
    [scopeKey]
  )
  const updateResponseComment = useCallback(
    (id: string, comment: string) =>
      setResponseComments((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, comment } : entry))
      ),
    [setResponseComments]
  )
  const removeResponseComment = useCallback(
    (id: string) => setResponseComments((current) => current.filter((entry) => entry.id !== id)),
    [setResponseComments]
  )
  const formattedDraft = useMemo(
    () => appendAiResponseComments(draft, responseComments),
    [draft, responseComments]
  )
  const hasValidResponseComments = useMemo(
    () => formatAiResponseComments(responseComments) !== '',
    [responseComments]
  )

  return {
    draft,
    setDraft,
    responseCommentDraft: {
      comments: responseComments,
      add: addResponseComment,
      clear: clearResponseComments,
      clearSubmitted: clearSubmittedResponseComments,
      restoreCanceledSend,
      update: updateResponseComment,
      remove: removeResponseComment,
      formattedDraft,
      hasValidComments: hasValidResponseComments
    }
  }
}
