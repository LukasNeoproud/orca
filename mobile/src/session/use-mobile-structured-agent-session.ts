import { useCallback, useEffect, useMemo, useRef } from 'react'
import { dispatchMobileStructuredCommand } from './mobile-structured-composer-command'
import type {
  AgentSessionBackgroundTaskState,
  AgentSessionSendResult
} from '../../../src/shared/agent-session-wire'
import {
  structuredAgentSessionSendBody,
  type StructuredAgentSessionAttachment
} from '../../../src/shared/structured-agent-session-outbox'
import { encodeNativeChatTranscriptIdentity } from '../../../src/shared/native-chat-transcript-retention'
import type { MobileNativeChatSendOutcome } from './mobile-native-chat-send'
import { activeStructuredAgentSessionTurnId } from '../../../src/shared/structured-agent-session-projection'
import {
  pendingStructuredApproval,
  pendingStructuredQuestion,
  projectStructuredPermission,
  projectStructuredQuestion
} from './mobile-structured-agent-prompts'
import {
  requestStructuredAgentSessionMutation,
  retainStructuredSessionOperationId as retainStructuredOpId,
  timeoutForDeadline
} from './mobile-structured-agent-session-rpc'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileChatPermission } from './mobile-native-chat-permission'
import type { MobileChatQuestion } from './mobile-native-chat-question'
import type { MobileNativeChatSession } from './use-mobile-native-chat-session'
import { useMobileStructuredAgentState } from './use-mobile-structured-agent-state'
import { useMobileStructuredPromptResponses } from './use-mobile-structured-prompt-responses'
import { useMobileStructuredAgentOptions } from './use-mobile-structured-agent-options'
import { useMobileConversationBranchSource } from './use-mobile-conversation-branch-source'
import { useMobileStructuredSessionStops } from './use-mobile-structured-session-stops'
import { useMobileStructuredTopicIndex } from './use-mobile-structured-topic-index'
import { useMobileStructuredSessionHandoff } from './use-mobile-structured-session-handoff'
import { useMobileStructuredSessionMutation } from './use-mobile-structured-session-mutation'
import { useMobileStructuredSendRetry } from './use-mobile-structured-send-retry'

type StructuredMobileAttachment = StructuredAgentSessionAttachment & { id?: string }

type StructuredMobileSession = ReturnType<typeof useMobileStructuredAgentOptions> & {
  session: MobileNativeChatSession
  epoch: string | null
  branchableMessageIds: ReadonlySet<string>
  isWorking: boolean
  turnId: string | null
  backgroundTasks: AgentSessionBackgroundTaskState | null
  topicIndex: ReturnType<typeof useMobileStructuredTopicIndex>
  journalItems: ReturnType<typeof useMobileStructuredAgentState>['state']['items']
  handoff: ReturnType<typeof useMobileStructuredSessionHandoff>
  sendRetry: ReturnType<typeof useMobileStructuredSendRetry>
  canStopBackgroundTasks: boolean
  stopBackgroundTask: (taskId?: string) => Promise<boolean>
  sendWithOutcome: (
    text: string,
    images?: string[],
    deadline?: number,
    attachments?: readonly StructuredMobileAttachment[]
  ) => Promise<MobileNativeChatSendOutcome>
  cancel: () => void
  permission: MobileChatPermission | null
  question: MobileChatQuestion | null
  respondPermission: (optionId: string) => Promise<boolean>
  respondQuestion: (answer: string) => Promise<boolean>
}

export function useMobileStructuredAgentSession(args: {
  client: RpcClient | null
  sessionId: string | null
  /** Host/workspace scope used to keep same provider ids isolated. */
  sourceIdentity?: string
  enabled: boolean
  /** Live transport only; gates the connection-scoped hold, nothing else. */
  connected: boolean
  agent: string | null
  onSendError: (message: string) => void
}): StructuredMobileSession {
  const { agent, client, connected, sessionId, sourceIdentity = '', enabled, onSendError } = args
  const sessionKey = encodeNativeChatTranscriptIdentity([sourceIdentity, agent, sessionId])
  const operationIdsRef = useRef(new Map<string, string>())
  const commandPendingRef = useRef(false)
  useEffect(() => () => operationIdsRef.current.clear(), [])
  const retainOperationId = (key: string, operationId?: string): string =>
    retainStructuredOpId(operationIdsRef.current, key, operationId)
  const stateArgs = { client, sessionId, sessionKey, enabled, connected }
  const { state, stateRef, loadingOlder, loadEarlier } = useMobileStructuredAgentState(stateArgs)
  const handoff = useMobileStructuredSessionHandoff({ ...stateArgs, state, stateRef })
  const topicIndex = useMobileStructuredTopicIndex({
    ...stateArgs,
    sourceIdentity,
    epoch: state.epoch,
    items: state.items
  })
  const sendRetry = useMobileStructuredSendRetry({
    ...stateArgs,
    ready: state.status === 'ready' && state.fence !== null,
    submissions: state.submissions
  })

  const mutate = useMobileStructuredSessionMutation({
    ...stateArgs,
    stateRef,
    operationIds: operationIdsRef,
    onSendError
  })

  const {
    codexUsage,
    conversationCommands,
    optionPickerRequest,
    invokeStructuredOption,
    optionSnapshot,
    optionSurface,
    pendingOptionId,
    setStructuredOption
  } = useMobileStructuredAgentOptions({
    agent,
    client,
    sessionId,
    enabled,
    fence: state.fence,
    mutate
  })

  const sendWithOutcome = useCallback(
    async (
      text: string,
      images?: string[],
      deadline?: number,
      attachments?: readonly StructuredMobileAttachment[]
    ): Promise<MobileNativeChatSendOutcome> => {
      const currentFence = stateRef.current.fence
      if (!client || !sessionId || !enabled || currentFence === null) {
        onSendError('Message not sent (disconnected)')
        return 'rejected'
      }
      if (!handoff.canSend) {
        onSendError('Message not sent while the session owner is changing or open in terminal.')
        return 'rejected'
      }
      const timeoutMs = timeoutForDeadline(deadline)
      if (timeoutMs === null) {
        onSendError('Message not sent')
        return 'rejected'
      }
      if (attachments === undefined && images !== undefined && images.length > 0) {
        onSendError('Message not sent')
        return 'rejected'
      }
      const sendAttachments = attachments ?? []
      const commandOutcome = await dispatchMobileStructuredCommand({
        text,
        hasAttachments: Boolean(sendAttachments.length || images?.length),
        client,
        sessionId,
        fence: currentFence,
        sessionKey,
        pending: commandPendingRef,
        operationIds: operationIdsRef.current,
        controller: {
          agent: agent === 'claude' ? 'claude' : 'codex',
          snapshot: optionSnapshot,
          setOption: setStructuredOption,
          invokeAction: invokeStructuredOption,
          conversationCommands
        },
        canRun: () =>
          !activeStructuredAgentSessionTurnId(stateRef.current.items) &&
          !stateRef.current.items.some(
            (item) => pendingStructuredApproval(item) || pendingStructuredQuestion(item)
          ),
        onError: onSendError,
        timeoutMs
      })
      if (commandOutcome !== null) {
        return commandOutcome
      }
      const body = structuredAgentSessionSendBody(text, sendAttachments)
      if (body.blocks.length === 0) {
        return 'rejected'
      }
      const fields = { body }
      const key = `${sessionKey}:agentSession.send:${JSON.stringify(fields)}`
      const priorOperationId = operationIdsRef.current.get(key)
      const clientOperationId = retainOperationId(key, priorOperationId)
      const result = await requestStructuredAgentSessionMutation<AgentSessionSendResult>({
        client,
        method: 'agentSession.send',
        fingerprintMethod: 'agentSession.send',
        sessionId,
        expectedRuntimeFence: currentFence,
        fields,
        clientOperationId,
        ...(priorOperationId ? { retryUnknown: true } : {}),
        timeoutMs
      })
      if (result.status === 'accepted') {
        operationIdsRef.current.delete(key)
        await sendRetry.clear(clientOperationId)
        return 'accepted'
      }
      if (result.status === 'unknown') {
        await sendRetry.rememberUnknown({
          sessionKey,
          sessionId,
          operationId: clientOperationId,
          fence: currentFence,
          body
        })
        return 'unknown'
      }
      operationIdsRef.current.delete(key)
      onSendError(result.message === 'Request not sent' ? 'Message not sent' : result.message)
      return 'rejected'
    },
    [
      agent,
      client,
      conversationCommands,
      enabled,
      handoff.canSend,
      invokeStructuredOption,
      onSendError,
      optionSnapshot,
      sessionId,
      sessionKey,
      sendRetry.clear,
      sendRetry.rememberUnknown,
      setStructuredOption
    ]
  )

  const { groupedDraft, respondPermission, respondQuestion } = useMobileStructuredPromptResponses({
    stateRef,
    sessionKey,
    mutate,
    onSendError
  })

  const { cancel, stopBackgroundTask } = useMobileStructuredSessionStops({
    client,
    connected,
    enabled,
    sessionId,
    sessionKey,
    stateRef,
    operationIds: operationIdsRef.current,
    mutate,
    onSendError
  })

  const { messages, branchableMessageIds } = useMobileConversationBranchSource(
    state.items,
    state.submissions
  )
  const status = state.status === 'idle' ? 'idle' : state.status
  const approvalPrompt = useMemo(
    () => state.items.find(pendingStructuredApproval) ?? null,
    [state.items]
  )
  const questionPrompt = useMemo(
    () => state.items.find(pendingStructuredQuestion) ?? null,
    [state.items]
  )

  return {
    codexUsage,
    conversationCommands,
    optionPickerRequest,
    session: {
      messages,
      status,
      transcriptLoading: status === 'loading',
      error: state.error,
      hasMore: state.hasOlder,
      loadingEarlier: loadingOlder,
      loadEarlier
    },
    epoch: state.epoch,
    branchableMessageIds,
    isWorking: activeStructuredAgentSessionTurnId(state.items) !== null,
    turnId: activeStructuredAgentSessionTurnId(state.items),
    backgroundTasks: state.backgroundTasks?.state === 'monitoring' ? state.backgroundTasks : null,
    topicIndex,
    journalItems: state.items,
    handoff,
    sendRetry,
    canStopBackgroundTasks: connected && state.fence !== null,
    stopBackgroundTask,
    sendWithOutcome,
    cancel,
    permission: projectStructuredPermission(approvalPrompt),
    question: projectStructuredQuestion(questionPrompt, groupedDraft),
    optionSnapshot,
    optionSurface,
    pendingOptionId,
    respondPermission,
    respondQuestion,
    setStructuredOption,
    invokeStructuredOption
  }
}
