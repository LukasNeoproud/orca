import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { MobileNativeChatTab } from './mobile-native-chat-eligibility'
import { useMobileNativeChatPermissionSend } from './mobile-native-chat-permission-send'
import { useMobileNativeChatAnswerSend } from './use-mobile-native-chat-answer-send'
import { useMobileNativeChatAskDismiss } from './use-mobile-native-chat-ask-dismiss'
import { useMobileNativeChatCancelAsk } from './use-mobile-native-chat-cancel-ask'
import { useMobileNativeChatDrafts } from './use-mobile-native-chat-drafts'
import { useMobileNativeChatFileSearch } from './use-mobile-native-chat-file-search'
import { useMobileNativeChatMessageSend } from './use-mobile-native-chat-message-send'
import { mobileNativeChatStreamPreview } from './mobile-native-chat-streaming-gate'
import { useMobileNativeChatSessionOptionController } from './use-mobile-native-chat-session-option-controller'
import { useMobileNativeChatSessionLane } from './use-mobile-native-chat-session-lane'
import { useMobileStructuredNativeChatSendBridge } from './use-mobile-structured-native-chat-send-bridge'
import { useMobileNativeChatPrompts } from './use-mobile-native-chat-prompts'
import { useMobileNativeChatStop } from './use-mobile-native-chat-stop'
import { useNativeChatAcceptedAction } from './use-native-chat-action-outcomes'
import { useThrottledLatestValue } from './use-throttled-latest-value'
import { useMobileNativeChatActiveResolution } from './use-mobile-native-chat-active-resolution'
import { readMobileStructuredLaunchDraft } from './mobile-structured-launch-drafts'
import { projectMobileStructuredChatState } from './mobile-native-chat-structured-state'

export type { MobileNativeChatController } from './mobile-native-chat-controller-contract'

export function useMobileNativeChatController(args: {
  client: RpcClient | null
  hostId: string
  worktreeId: string
  activeSessionTab: MobileNativeChatTab | null
  activeSessionTabId: string | null
  activeHandleRef: MutableRefObject<string | null>
  deviceTokenRef: MutableRefObject<string | null>
  nativeChatTranscriptIsLocalReadable: boolean
  nativeChatInputLeaseReady: boolean
  connState: ConnectionState
  onSendError: (message: string) => void
  /** Any accepted chat write clears the held failure banner. */
  onSendResolved: () => void
}) {
  const {
    client,
    hostId,
    worktreeId,
    activeSessionTab,
    activeSessionTabId,
    activeHandleRef,
    deviceTokenRef,
    nativeChatTranscriptIsLocalReadable,
    nativeChatInputLeaseReady,
    connState,
    onSendError,
    onSendResolved
  } = args
  const {
    activeChatAgent,
    activeChatAgentRef,
    activeChatResolution,
    activeChatSessionId,
    activeChatStructured,
    activeTabAgentWorking,
    isTabChatView,
    nativeChatStatus,
    showNativeChat,
    showNativeChatRef,
    sourceIdentity,
    streamIdentity,
    streamScopeKey,
    toggleTabChatView
  } = useMobileNativeChatActiveResolution({
    hostId,
    worktreeId,
    activeSessionTab,
    activeSessionTabId,
    activeHandleRef,
    nativeChatTranscriptIsLocalReadable
  })
  const stagedLaunchDraft = readMobileStructuredLaunchDraft(hostId, activeChatSessionId)

  const { structuredSession: structuredNativeChat, session: nativeChatSession } =
    useMobileNativeChatSessionLane({
      client,
      hostId,
      structured: activeChatStructured,
      agent: activeChatAgent,
      resolvedAgent: activeChatResolution?.agent ?? null,
      transcriptPath: activeChatResolution?.transcriptPath ?? null,
      sessionId: activeChatSessionId,
      sourceIdentity,
      enabled: showNativeChat,
      connState,
      onSendError
    })
  const {
    composerText: chatComposerText,
    setComposerText: setChatComposerText,
    getComposerEditGeneration: getChatComposerEditGeneration,
    pending: chatPending,
    imagePreviewsByMessageId: chatImagePreviewsByMessageId,
    captureSendOrigin,
    readSeededLaunchDraft,
    readSeededLaunchDraftSeed,
    clearDraftForSend,
    restoreRejectedDraft,
    acceptSend,
    holdUnconfirmedSend
  } = useMobileNativeChatDrafts({
    hostId,
    worktreeId,
    tabId: activeSessionTabId,
    sessionId: activeChatSessionId,
    messages: nativeChatSession.messages,
    launchDraft: activeSessionTab?.launchDraft ?? stagedLaunchDraft?.text ?? null,
    launchDraftCreatedAt:
      activeSessionTab?.launchDraftCreatedAt ?? stagedLaunchDraft?.createdAt ?? null,
    // Preserve a host draft while the terminal view temporarily covers chat.
    chatActive: showNativeChat,
    transcriptLoading: nativeChatSession.transcriptLoading,
    transcriptSettled: nativeChatSession.status === 'ready'
  })

  const nativeChatAgentWorking = activeChatStructured
    ? structuredNativeChat.isWorking
    : activeChatResolution != null && activeTabAgentWorking
  // The streaming gate distinguishes a hidden live turn from a settled turn.
  const nativeChatStreamLive = activeChatStructured
    ? structuredNativeChat.isWorking
    : activeTabAgentWorking
  // Avoid re-parsing accumulated markdown for every streamed status frame.
  const nativeChatStreamingText = useThrottledLatestValue(
    activeChatStructured
      ? undefined
      : mobileNativeChatStreamPreview(nativeChatStatus, nativeChatAgentWorking),
    50
  )
  const {
    permission: legacyNativeChatPermission,
    question: legacyNativeChatQuestion,
    detectedAsk: nativeChatDetectedAsk,
    ask: nativeChatAskPrompt
  } = useMobileNativeChatPrompts({
    enabled: activeChatResolution != null && !activeChatStructured,
    status: nativeChatStatus,
    messages: nativeChatSession.messages,
    transcriptLoading: nativeChatSession.transcriptLoading
  })
  // A never-read transcript cannot prove that a dismissed prompt cleared.
  const nativeChatTranscriptSettled =
    nativeChatSession.status === 'ready' ||
    (nativeChatSession.status === 'error' && nativeChatSession.messages.length > 0)
  const {
    askKey: nativeChatAskKey,
    showAsk: showNativeChatAsk,
    dismissAsk: dismissNativeChatAsk
  } = useMobileNativeChatAskDismiss({
    ask: nativeChatAskPrompt,
    detectedAsk: nativeChatDetectedAsk,
    scopeKey: activeSessionTabId,
    sessionKey: activeChatSessionId,
    observing: showNativeChat && (nativeChatDetectedAsk != null || nativeChatTranscriptSettled)
  })

  // The socket verdict collapses one render before the input lease on disconnect.
  const inputSendable = activeChatStructured
    ? client != null && activeChatSessionId != null && connState === 'connected'
    : nativeChatInputLeaseReady && connState === 'connected'

  const { answerAsk: handleNativeChatAnswerAsk, cancelPending: cancelNativeChatAnswer } =
    useMobileNativeChatAnswerSend({
      client,
      enabled: inputSendable && !activeChatStructured,
      handleRef: activeHandleRef,
      deviceTokenRef,
      agentRef: activeChatAgentRef,
      sessionId: activeChatSessionId,
      streamIdentity,
      onSendError
    })

  const handleNativeChatCancelAsk = useMobileNativeChatCancelAsk({
    client,
    enabled: inputSendable && !activeChatStructured,
    handleRef: activeHandleRef,
    deviceTokenRef,
    cancelPending: cancelNativeChatAnswer,
    onSendError
  })

  const legacyHandleNativeChatRespondPermission = useMobileNativeChatPermissionSend({
    client,
    enabled: inputSendable && !activeChatStructured,
    handleRef: activeHandleRef,
    deviceTokenRef,
    onSendError
  })

  const handleNativeChatStop = useMobileNativeChatStop({
    client,
    enabled: inputSendable && !activeChatStructured,
    handleRef: activeHandleRef,
    deviceTokenRef,
    streamIdentity,
    cancelPending: cancelNativeChatAnswer,
    onSendError
  })

  const { nativeChatFilePaths, loadNativeChatFiles } = useMobileNativeChatFileSearch({
    client,
    worktreeId
  })

  // A ref breaks the command dispatcher/options tracking dependency cycle.
  const recordSessionOptionCommandRef = useRef<(command: string) => void>(() => {})

  const {
    send: handleNativeChatSend,
    sendWithOutcome: handleNativeChatSendWithOutcome,
    answerQuestion: legacyHandleNativeChatQuestionAnswer,
    dispatchCommand: handleNativeChatDispatchCommand
  } = useMobileNativeChatMessageSend({
    client,
    enabled: inputSendable && !activeChatStructured,
    handleRef: activeHandleRef,
    deviceTokenRef,
    agentRef: activeChatAgentRef,
    commandSendRef: recordSessionOptionCommandRef,
    captureSendOrigin,
    readSeededLaunchDraftSeed,
    clearDraftForSend,
    restoreRejectedDraft,
    acceptSend,
    holdUnconfirmedSend,
    onSendError
  })

  const structuredNativeChatSend = useMobileStructuredNativeChatSendBridge({
    sendStructured: structuredNativeChat.sendWithOutcome,
    captureSendOrigin,
    clearDraftForSend,
    acceptSend,
    holdUnconfirmedSend,
    restoreRejectedDraft,
    onSendError
  })

  const { nativeChatSessionOptions, recordCommand: recordNativeChatSessionOptionCommand } =
    useMobileNativeChatSessionOptionController({
      activeChatStructured,
      activeSessionTabId,
      agent: activeChatResolution?.agent ?? null,
      dispatchCommand: handleNativeChatDispatchCommand,
      hostId,
      isTabChatView,
      isWorking: nativeChatAgentWorking,
      reportedModel: activeSessionTab?.agentStatus?.model ?? null,
      structured: {
        optionPickerRequest: structuredNativeChat.optionPickerRequest,
        conversationCommands: structuredNativeChat.conversationCommands,
        snapshot: structuredNativeChat.optionSnapshot,
        pendingId: structuredNativeChat.pendingOptionId,
        setOption: structuredNativeChat.setStructuredOption,
        invokeAction: structuredNativeChat.invokeStructuredOption
      },
      toggleTabChatView,
      worktreeId
    })
  useLayoutEffect(() => {
    recordSessionOptionCommandRef.current = recordNativeChatSessionOptionCommand
  }, [recordNativeChatSessionOptionCommand])
  // Card actions retire the route's held failure banner too, not just sends.
  const answerAsk = useNativeChatAcceptedAction(handleNativeChatAnswerAsk, onSendResolved)
  const cancelAsk = useNativeChatAcceptedAction(handleNativeChatCancelAsk, onSendResolved)
  const handleNativeChatRespondPermission = activeChatStructured
    ? structuredNativeChat.respondPermission
    : legacyHandleNativeChatRespondPermission
  const respond = useNativeChatAcceptedAction(handleNativeChatRespondPermission, onSendResolved)

  return {
    isTabChatView,
    toggleTabChatView,
    showNativeChat,
    showNativeChatRef,
    nativeChatAgent: activeChatResolution?.agent ?? null,
    chatComposerText,
    setChatComposerText,
    getChatComposerEditGeneration,
    chatPending,
    chatImagePreviewsByMessageId,
    nativeChatSession,
    nativeChatStructured: activeChatStructured,
    ...projectMobileStructuredChatState(
      activeChatStructured,
      structuredNativeChat,
      legacyNativeChatPermission,
      legacyNativeChatQuestion
    ),
    nativeChatAgentWorking,
    nativeChatStreamingText,
    nativeChatStreamLive,
    nativeChatStreamScopeKey: streamScopeKey,
    nativeChatAsk: !activeChatStructured && showNativeChatAsk ? nativeChatAskPrompt : null,
    nativeChatAskKey,
    dismissNativeChatAsk,
    handleNativeChatAnswerAsk: answerAsk,
    handleNativeChatCancelAsk: cancelAsk,
    handleNativeChatRespondPermission: respond,
    handleNativeChatStop: activeChatStructured ? structuredNativeChat.cancel : handleNativeChatStop,
    nativeChatFilePaths,
    loadNativeChatFiles,
    handleNativeChatQuestionAnswer: activeChatStructured
      ? structuredNativeChat.respondQuestion
      : legacyHandleNativeChatQuestionAnswer,
    handleNativeChatSend: activeChatStructured
      ? structuredNativeChatSend.send
      : handleNativeChatSend,
    handleNativeChatSendWithOutcome: activeChatStructured
      ? structuredNativeChatSend.sendWithOutcome
      : handleNativeChatSendWithOutcome,
    readSeededLaunchDraft,
    nativeChatSessionOptions,
    conversationBranch: structuredNativeChat.conversationBranch
  }
}
