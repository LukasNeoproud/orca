import { useCallback, useLayoutEffect, useRef } from 'react'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import { reportStructuredSessionUserInput } from '@/lib/worker-terminal-takeover-report'
import { isStructuredAgentSessionComposerCommand } from '../../../../shared/structured-agent-session-composer'
import type { AgentType } from '../../../../shared/agent-status-types'
import { dispatchNativeChatStructuredComposerText } from './native-chat-structured-composer-dispatch'
import { pushHistory, type HistoryState } from './native-chat-composer-state'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'
import type { AiResponseComment } from '../../../../shared/ai-response-comments'

export type UseNativeChatStructuredComposerSendArgs = {
  agent: AgentType
  draft?: string
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  responseComments?: readonly AiResponseComment[]
  structuredTransport?: NativeChatStructuredComposerTransport
  clearImageAttachments: () => void
  clearSubmittedResponseComments?: (comments: readonly AiResponseComment[]) => void
  clearSkillOrigin: () => void
  isComposing?: () => boolean
  setHistory: (updater: (previous: HistoryState) => HistoryState) => void
  setDraft: (value: string | ((previous: string) => string)) => void
  setCaret: (caret: number) => void
}

/** Send through the structured journal transport, clearing the composer only
 *  once the transport accepts (the PTY path has its own sibling hook). */
export function useNativeChatStructuredComposerSend({
  agent,
  draft,
  imageAttachments,
  responseComments = [],
  structuredTransport,
  clearImageAttachments,
  clearSubmittedResponseComments = () => {},
  clearSkillOrigin,
  isComposing = () => false,
  setHistory,
  setDraft,
  setCaret
}: UseNativeChatStructuredComposerSendArgs): (
  text: string,
  attachments?: readonly NativeChatComposerImageAttachment[],
  comments?: readonly AiResponseComment[]
) => void {
  const composition = useRef({ draft, imageAttachments, responseComments })
  useLayoutEffect(() => {
    composition.current = { draft, imageAttachments, responseComments }
  }, [draft, imageAttachments, responseComments])
  return useCallback(
    (text: string, attachments = imageAttachments, comments = []): void => {
      if (!structuredTransport) {
        return
      }
      if (attachments.length > 0 && isStructuredAgentSessionComposerCommand(text, agent)) {
        structuredTransport.onError('Remove attachments before using a chat-session command.')
        return
      }
      const submitted = composition.current
      void dispatchNativeChatStructuredComposerText(structuredTransport, text, attachments)
        .then(({ accepted, error }) => {
          structuredTransport.onError(error)
          if (!accepted) {
            return
          }
          emitNativeChatMessageSent({ agent, runtime: structuredTransport.runtime })
          // A real user send is a takeover, exactly as typing into a worker's pane is. Only past
          // `accepted`, and only from this hook: the outbox dispatcher retries and would re-fire,
          // and orchestration's own pointer nudges never reach the composer at all.
          reportStructuredSessionUserInput(
            structuredTransport.sessionId,
            structuredTransport.runtimeEnvironmentId
          )
          setHistory((previous) => pushHistory(previous, text))
          if (comments.length > 0) {
            clearSubmittedResponseComments(comments)
          }
          if (composition.current.imageAttachments !== submitted.imageAttachments) {
            return
          }
          if (composition.current.draft !== submitted.draft && !isComposing()) {
            return
          }
          setDraft('')
          setCaret(0)
          clearSkillOrigin()
          clearImageAttachments()
        })
        .catch((error) =>
          structuredTransport.onError(error instanceof Error ? error.message : String(error))
        )
    },
    [
      agent,
      clearImageAttachments,
      clearSkillOrigin,
      clearSubmittedResponseComments,
      imageAttachments,
      isComposing,
      setCaret,
      setDraft,
      setHistory,
      structuredTransport
    ]
  )
}
