import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { MobileNativeChatView, type MobileNativeChatInputLockReason } from './MobileNativeChatView'
import { foldMobileNativeChatMessages } from './mobile-native-chat-render-data'
import type { MobileNativeChatImageAttachments } from './use-mobile-native-chat-image-attachments'
import type { MobileNativeChatController } from './use-mobile-native-chat-controller'
import { useMobileNativeChatStreamingBubble } from './use-mobile-native-chat-streaming-bubble'
import { MobileConversationBranchDrawers } from './MobileConversationBranchDrawers'
import { MobileStructuredTopicIndexPanel } from './MobileStructuredTopicIndexPanel'
import { MobileStructuredHandoffStatus } from './MobileStructuredHandoffStatus'
import { MobileStructuredContinuationPanel } from './MobileStructuredContinuationPanel'
import type { RpcClient } from '../transport/rpc-client'
import { requestMobileConversationAnchor } from './mobile-conversation-anchor-request'

type Props = {
  controller: MobileNativeChatController
  client?: RpcClient | null
  hostId?: string
  worktreeId?: string
  structuredSessionId?: string | null
  onContinuationOpened?: (sessionId: string) => void | Promise<void>
  /** Opens a tapped file reference (worktree-relative or absolute, optional
   *  :line(:col) suffix) through the shared tap-to-open flow. */
  onOpenFile: (pathText: string) => void
  /** Native-chat image attachments: picking adds a composer chip, and sending
   *  rides the pending images along with the message text (desktop parity). */
  images: MobileNativeChatImageAttachments
  onMicPress: () => void
  micActive: boolean
  dictationMode: 'toggle' | 'hold'
  onMicPressIn: () => void
  onMicPressOut: () => void
  inputLockReason: MobileNativeChatInputLockReason | null
  /** Latest send failure, rendered inline above the composer. */
  sendErrorMessage: string | null
  /** Drops that failure once a later send succeeds. */
  onClearSendError: () => void
  /** Stable host/worktree/tab identity for accepted-send completion fencing. */
  sendSurfaceId: string
  /** Reads the retained route's focus generation for accepted-send fencing. */
  getSendCompletionGeneration: () => number
  keyboardInset: number
}

/** Keeps the terminal mounted underneath chat so its PTY subscription survives
 *  view toggles while the native surface owns the visible composer. Also owns
 *  the streaming gate: this component stays mounted across those toggles, while
 *  the chat list below it does not. */
export function MobileNativeChatOverlay({
  controller,
  client,
  hostId,
  worktreeId,
  structuredSessionId,
  onContinuationOpened,
  onOpenFile,
  images,
  onMicPress,
  micActive,
  dictationMode,
  onMicPressIn,
  onMicPressOut,
  inputLockReason,
  sendErrorMessage,
  onClearSendError,
  sendSurfaceId,
  getSendCompletionGeneration,
  keyboardInset
}: Props): React.JSX.Element | null {
  const session = controller.nativeChatSession
  const folded = useMemo(() => foldMobileNativeChatMessages(session.messages), [session.messages])
  const streaming = useMobileNativeChatStreamingBubble(
    folded,
    controller.nativeChatStreamingText,
    controller.nativeChatStreamScopeKey,
    controller.nativeChatStreamLive
  )
  if (!controller.showNativeChat) {
    return null
  }
  return (
    <View style={styles.overlay}>
      {controller.nativeChatHandoff ? (
        <MobileStructuredHandoffStatus
          status={controller.nativeChatHandoff.status}
          pending={controller.nativeChatHandoff.pending}
          uncertain={controller.nativeChatHandoff.uncertain}
          error={controller.nativeChatHandoff.error}
          isWorking={controller.nativeChatAgentWorking}
          onRequest={controller.nativeChatHandoff.request}
        />
      ) : null}
      {client && hostId && worktreeId && onContinuationOpened ? (
        <MobileStructuredContinuationPanel
          client={client}
          connected={inputLockReason !== 'disconnected'}
          hostId={hostId}
          worktreeId={worktreeId}
          sessionId={structuredSessionId ?? null}
          agent={controller.nativeChatAgent}
          busy={
            controller.nativeChatAgentWorking ||
            Boolean(controller.nativeChatPermission || controller.nativeChatQuestion)
          }
          draft={controller.chatComposerText}
          onOpened={onContinuationOpened}
        />
      ) : null}
      {controller.nativeChatTopicIndex?.supported ? (
        <MobileStructuredTopicIndexPanel
          index={controller.nativeChatTopicIndex.index}
          ready={controller.nativeChatTopicIndex.ready}
          error={controller.nativeChatTopicIndex.error}
          epoch={controller.nativeChatEpoch}
          items={controller.nativeChatJournalItems}
          onNavigate={(anchor) => {
            if (hostId && structuredSessionId && anchor.epoch === controller.nativeChatEpoch) {
              requestMobileConversationAnchor(hostId, structuredSessionId, anchor)
            }
          }}
          onSave={(index) => void controller.nativeChatTopicIndex?.save(index)}
          onLoadOlder={() => controller.nativeChatSession.loadEarlier?.()}
        />
      ) : null}
      <MobileNativeChatView
        messages={session.messages}
        folded={folded}
        status={session.status}
        error={session.error}
        agent={controller.nativeChatAgent}
        agentWorking={controller.nativeChatAgentWorking}
        structuredActivityUi={controller.nativeChatStructured}
        codexUsage={controller.nativeChatCodexUsage}
        backgroundTasks={controller.nativeChatBackgroundTasks}
        sendRetry={controller.nativeChatSendRetry}
        canStopBackgroundTasks={controller.canStopNativeChatBackgroundTasks}
        onStopBackgroundTask={controller.stopNativeChatBackgroundTask}
        streaming={streaming}
        onStop={controller.handleNativeChatStop}
        ask={controller.nativeChatAsk}
        askKey={controller.nativeChatAskKey}
        onDismissAsk={controller.dismissNativeChatAsk}
        onAnswerAsk={controller.handleNativeChatAnswerAsk}
        onCancelAsk={controller.handleNativeChatCancelAsk}
        question={controller.nativeChatQuestion}
        onAnswerQuestion={controller.handleNativeChatQuestionAnswer}
        permission={controller.nativeChatPermission}
        onRespondPermission={controller.handleNativeChatRespondPermission}
        onOpenFile={onOpenFile}
        canBranchMessage={controller.conversationBranch.canBranchMessage}
        onBranchMessage={controller.conversationBranch.openBranch}
        relatedConversationCount={controller.conversationBranch.family.branches.length}
        onOpenRelatedConversations={
          controller.conversationBranch.supported
            ? () => controller.conversationBranch.setFamilyVisible(true)
            : undefined
        }
        conversationAnchor={controller.conversationBranch.anchorRequest}
        onConversationAnchorConsumed={controller.conversationBranch.consumeAnchor}
        hasMore={session.hasMore}
        loadingEarlier={session.loadingEarlier}
        onLoadEarlier={session.loadEarlier}
        onSend={images.sendNativeChat}
        sendSurfaceId={sendSurfaceId}
        getSendCompletionGeneration={getSendCompletionGeneration}
        getComposerEditGeneration={controller.getChatComposerEditGeneration}
        pending={controller.chatPending}
        imagePreviewsByMessageId={controller.chatImagePreviewsByMessageId}
        composerText={controller.chatComposerText}
        onComposerTextChange={controller.setChatComposerText}
        onAttachImage={() => void images.attachImage('library')}
        attachments={images.attachments}
        onRemoveAttachment={images.removeAttachment}
        isAttaching={images.isAttaching}
        onMicPress={onMicPress}
        micActive={micActive}
        dictationMode={dictationMode}
        onMicPressIn={onMicPressIn}
        onMicPressOut={onMicPressOut}
        inputLockReason={
          controller.nativeChatHandoff && !controller.nativeChatHandoff.canSend
            ? 'handoff'
            : inputLockReason
        }
        sendErrorMessage={sendErrorMessage}
        onClearSendError={onClearSendError}
        filePaths={controller.nativeChatFilePaths}
        onNeedFiles={controller.loadNativeChatFiles}
        sessionOptions={controller.nativeChatSessionOptions}
        keyboardInset={keyboardInset}
      />
      <MobileConversationBranchDrawers controller={controller.conversationBranch} />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: StyleSheet.absoluteFillObject
})
