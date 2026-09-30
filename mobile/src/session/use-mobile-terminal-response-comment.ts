import { useCallback, useState } from 'react'
import { appendAiResponseComments } from '../../../src/shared/ai-response-comments'
import { triggerSuccess } from '../platform/haptics'
import type { MobileSessionTerminalInputModel } from './use-mobile-session-terminal-input'
import { isMobileTerminalResponseCommentTargetActive } from './mobile-terminal-response-comment-target'
import { buildMobileTerminalResponseCommentPaste } from './mobile-terminal-response-comment-paste'

export function useMobileTerminalResponseComment(scope: MobileSessionTerminalInputModel) {
  const [draft, setDraft] = useState<{ handle: string; quote: string; comment: string } | null>(
    null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectionComment = useCallback((handle: string, text: string) => {
    if (handle !== scope.activeHandleRef.current || !text.trim()) {
      return
    }
    scope.terminalRefs.current.get(handle)?.cancelSelect()
    scope.setSelectModeActive(false)
    setError(null)
    setDraft({ handle, quote: text, comment: '' })
  }, [])

  const close = useCallback(() => {
    if (!saving) {
      setDraft(null)
      setError(null)
    }
  }, [saving])

  const save = useCallback(
    async (comment: string) => {
      if (!draft || saving || !comment.trim()) {
        return
      }
      const formatted = appendAiResponseComments('', [
        { id: 'terminal-response-comment', quote: draft.quote, comment }
      ])
      setSaving(true)
      setError(null)
      try {
        if (!targetIsActive(scope, draft.handle)) {
          setError('The active terminal changed')
          return
        }
        if (scope.liveInputEnabled) {
          const flushed = await scope.flushPendingLiveInputBeforeExternalSend(draft.handle)
          if (!flushed) {
            setError("Couldn't add comment")
            return
          }
          if (!targetIsActive(scope, draft.handle)) {
            setError('The active terminal changed')
            return
          }
          const modes = scope.ptyModesRef.current.get(draft.handle)
          if (!modes?.bracketedPasteMode) {
            setError('Protected paste is unavailable in this terminal')
            return
          }
          const payload = buildMobileTerminalResponseCommentPaste(formatted, modes)
          if (!(await scope.sendLiveTerminalInput(draft.handle, payload))) {
            setError("Couldn't add comment")
            return
          }
        } else {
          scope.bufferedTerminalDraftState.setInput((current) =>
            appendAiResponseComments(current, [
              { id: 'terminal-response-comment', quote: draft.quote, comment }
            ])
          )
        }
        triggerSuccess()
        setDraft(null)
      } catch {
        setError("Couldn't add comment")
      } finally {
        setSaving(false)
      }
    },
    [draft, saving, scope]
  )

  return {
    terminalResponseCommentDraft: draft,
    terminalResponseCommentSaving: saving,
    terminalResponseCommentError: error,
    handleSelectionComment,
    closeTerminalResponseComment: close,
    saveTerminalResponseComment: save
  }
}

function targetIsActive(scope: MobileSessionTerminalInputModel, handle: string): boolean {
  return isMobileTerminalResponseCommentTargetActive(
    handle,
    scope.activeHandleRef.current,
    scope.activeSessionTabTypeRef.current
  )
}
