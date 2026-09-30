import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { ArrowDown, ChevronsDownUp, ChevronsUpDown, GitBranch, Square } from 'lucide-react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-native-chat-view-styles'
import {
  buildMobileNativeChatTransientData,
  mobileNativeChatEmptyState
} from './mobile-native-chat-render-data'
import { useMobileNativeChatPinchGesture } from './use-mobile-native-chat-pinch-gesture'
import { useMobileNativeChatTurnDisclosure } from './use-mobile-native-chat-turn-disclosure'
import { MobileNativeChatTurnStatus } from './MobileNativeChatTurnStatus'
import { MobileAgentWorkingIndicator } from './MobileAgentWorkingIndicator'
import { MobileNativeChatComposer } from './MobileNativeChatComposer'
import { MobileNativeChatPromptCard } from './MobileNativeChatPromptCard'
import { MobileNativeChatMessage } from './MobileNativeChatMessage'
import { MobileCodexUsageStatus } from './MobileCodexUsageStatus'
import { MobileNativeChatBackgroundTasksStatus } from './MobileNativeChatBackgroundTasksStatus'
import type { MobileNativeChatViewProps } from './mobile-native-chat-view-types'
import { useMobileConversationAnchorScroll } from './use-mobile-conversation-anchor-scroll'
import { mobileNativeChatComposerPlaceholder } from './mobile-native-chat-composer-placeholder'
import { MobileStructuredSendRetryStatus } from './MobileStructuredSendRetryStatus'
import type { AiResponseComment } from '../../../src/shared/ai-response-comments'
import { useMobileNativeChatResponseCommentUi } from './use-mobile-native-chat-response-comment-ui'
import { useMobileNativeChatViewSend } from './use-mobile-native-chat-view-send'

export type { MobileNativeChatInputLockReason } from './mobile-native-chat-view-types'

const INPUT_LOCK_SETTLE_MS = 600
const NO_RESPONSE_COMMENTS: readonly AiResponseComment[] = []
const ignoreAddResponseComment = (): void => undefined
const ignoreUpdateResponseComment = (): void => undefined
const ignoreDeleteResponseComment = (): void => undefined

export function MobileNativeChatView({
  messages,
  folded,
  status,
  error,
  agent,
  agentWorking,
  structuredActivityUi = false,
  codexUsage,
  backgroundTasks,
  sendRetry,
  canStopBackgroundTasks = false,
  onStopBackgroundTask,
  onStop,
  streaming,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
  onSend,
  sendSurfaceId,
  getSendCompletionGeneration,
  getComposerEditGeneration,
  pending,
  imagePreviewsByMessageId,
  composerText,
  onComposerTextChange,
  responseComments = NO_RESPONSE_COMMENTS,
  onAddResponseComment = ignoreAddResponseComment,
  onUpdateResponseComment = ignoreUpdateResponseComment,
  onDeleteResponseComment = ignoreDeleteResponseComment,
  onAttachImage,
  attachments,
  onRemoveAttachment,
  isAttaching,
  onMicPress,
  micActive,
  dictationMode,
  onMicPressIn,
  onMicPressOut,
  inputLockReason,
  sendErrorMessage,
  onClearSendError,
  filePaths,
  onNeedFiles,
  sessionOptions,
  ask,
  askKey,
  onDismissAsk,
  onAnswerAsk,
  onCancelAsk,
  question,
  onAnswerQuestion,
  permission,
  onRespondPermission,
  onOpenFile,
  canBranchMessage,
  onBranchMessage,
  relatedConversationCount,
  onOpenRelatedConversations,
  conversationAnchor,
  onConversationAnchorConsumed,
  keyboardInset = 0
}: MobileNativeChatViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<NativeChatMessage>>(null)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const responseCommentUi = useMobileNativeChatResponseCommentUi({
    sendSurfaceId,
    comments: responseComments,
    onAdd: onAddResponseComment,
    onUpdate: onUpdateResponseComment,
    onDelete: onDeleteResponseComment
  })
  const bottomPad = keyboardInset > 0 ? keyboardInset + insets.bottom : insets.bottom
  const [atBottom, setAtBottom] = useState(true)
  const { fontScale, pinchGesture } = useMobileNativeChatPinchGesture()

  const { data } = useMemo(
    () =>
      buildMobileNativeChatTransientData({
        messages,
        folded,
        streaming,
        pending,
        imagePreviewsByMessageId
      }),
    [messages, folded, streaming, pending, imagePreviewsByMessageId]
  )
  useMobileConversationAnchorScroll({
    anchor: conversationAnchor,
    data,
    hasMore,
    loadingEarlier,
    listRef,
    onLoadEarlier,
    onConsumed: onConversationAnchorConsumed
  })

  useEffect(() => {
    if (data.length === 0 || !atBottom) {
      return
    }
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [data.length, atBottom, keyboardInset])

  const handleSend = useMobileNativeChatViewSend({
    onSend,
    onClearSendError,
    listRef,
    setAtBottom
  })

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
      setAtBottom(distanceFromBottom < 80)
      if (contentOffset.y < 60 && hasMore && !loadingEarlier) {
        onLoadEarlier?.()
      }
    },
    [hasMore, loadingEarlier, onLoadEarlier]
  )

  const onScrollToMessage = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true })
  }, [])

  const turns = useMobileNativeChatTurnDisclosure({
    messages: data,
    enabled: structuredActivityUi,
    isWorking: agentWorking === true,
    scopeKey: sendSurfaceId
  })

  const renderItem = useCallback(
    ({ item, index }: { item: NativeChatMessage; index: number }) => (
      <MobileNativeChatMessage
        message={item}
        toolsExpanded={toolsExpanded}
        fontScale={fontScale}
        messageIndex={index}
        onScrollToMessage={onScrollToMessage}
        onOpenFile={onOpenFile}
        structuredActivityUi={structuredActivityUi}
        onToggleTurn={turns.onToggleTurn}
        {...turns.resolveRow(index, item)}
        onBranchMessage={onBranchMessage && canBranchMessage?.(item) ? onBranchMessage : undefined}
        onCommentQuote={responseCommentUi.onCommentQuote}
      />
    ),
    [
      toolsExpanded,
      fontScale,
      onScrollToMessage,
      onOpenFile,
      structuredActivityUi,
      turns,
      canBranchMessage,
      onBranchMessage,
      responseCommentUi.onCommentQuote
    ]
  )

  const emptyState = mobileNativeChatEmptyState(status, agent ?? null, error)
  const showLoading = status === 'loading' && messages.length === 0

  const rawLockReason = inputLockReason ?? null
  const rawLockHeld = rawLockReason !== null
  const [lockHeld, setLockHeld] = useState(false)
  useEffect(() => {
    if (rawLockHeld === lockHeld) {
      return
    }
    const timer = setTimeout(() => setLockHeld(rawLockHeld), INPUT_LOCK_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [lockHeld, rawLockHeld])
  const lockReason = lockHeld ? (rawLockReason ?? 'waiting') : null

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <GestureHandlerRootView style={styles.listWrap}>
          <GestureDetector gesture={pinchGesture}>
            <FlatList
              ref={listRef}
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              onScroll={onScroll}
              scrollEventThrottle={32}
              onContentSizeChange={() => {
                if (data.length > 0 && atBottom) {
                  listRef.current?.scrollToEnd({ animated: false })
                }
              }}
              // scrollToIndex can fail before an off-screen row is measured —
              // fall back to an estimated offset, then retry once it's laid out.
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true
                })
                setTimeout(() => {
                  listRef.current?.scrollToIndex({
                    index: info.index,
                    viewPosition: 0,
                    animated: true
                  })
                }, 120)
              }}
              ListHeaderComponent={
                hasMore ? (
                  <Pressable
                    style={styles.loadEarlier}
                    onPress={onLoadEarlier}
                    disabled={loadingEarlier}
                  >
                    {loadingEarlier ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : (
                      <Text style={styles.loadEarlierText}>Load earlier messages</Text>
                    )}
                  </Pressable>
                ) : null
              }
              ListFooterComponent={
                turns.activeTurnIsUnanchored && turns.active ? (
                  <MobileNativeChatTurnStatus
                    startedAt={turns.active.startedAt}
                    thinking={turns.active.thinking}
                    workedSeconds={turns.active.workedSeconds}
                  />
                ) : null
              }
              ListEmptyComponent={
                emptyState ? (
                  <View style={styles.center}>
                    <Text style={styles.emptyTitle}>{emptyState.title}</Text>
                    <Text style={styles.emptySubtitle}>{emptyState.subtitle}</Text>
                  </View>
                ) : null
              }
            />
          </GestureDetector>
          {!atBottom ? (
            <Pressable
              accessibilityLabel="Scroll to latest"
              style={[styles.fab, styles.fabBottom]}
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
            >
              <ArrowDown size={18} color={colors.textPrimary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </GestureHandlerRootView>
      )}
      <MobileNativeChatPromptCard
        ask={ask}
        askKey={askKey}
        onDismissAsk={onDismissAsk}
        onAnswerAsk={onAnswerAsk}
        onCancelAsk={onCancelAsk}
        permission={permission}
        onRespondPermission={onRespondPermission}
        question={question}
        onAnswerQuestion={onAnswerQuestion}
      />
      <MobileNativeChatBackgroundTasksStatus
        key={sendSurfaceId}
        state={backgroundTasks}
        canStop={canStopBackgroundTasks}
        onStop={onStopBackgroundTask}
        activeTurn={agentWorking === true}
      />
      <MobileStructuredSendRetryStatus retry={sendRetry ?? null} />
      <View style={styles.chromeRow}>
        <View style={styles.chromeLeft}>
          <MobileCodexUsageStatus usage={codexUsage ?? null} />
          {agentWorking && !structuredActivityUi ? <MobileAgentWorkingIndicator /> : null}
          <Pressable
            style={({ pressed }) => [styles.chromeToggle, pressed && styles.pressed]}
            onPress={() => setToolsExpanded((v) => !v)}
            hitSlop={8}
          >
            {toolsExpanded ? (
              <ChevronsDownUp size={14} color={colors.textMuted} strokeWidth={2} />
            ) : (
              <ChevronsUpDown size={14} color={colors.textMuted} strokeWidth={2} />
            )}
            <Text style={styles.chromeToggleLabel}>{toolsExpanded ? 'Collapse' : 'Tools'}</Text>
          </Pressable>
          {onOpenRelatedConversations ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open related conversations"
              style={({ pressed }) => [styles.chromeToggle, pressed && styles.pressed]}
              onPress={onOpenRelatedConversations}
              hitSlop={8}
            >
              <GitBranch size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.chromeToggleLabel}>
                Related{relatedConversationCount ? ` ${relatedConversationCount}` : ''}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {agentWorking ? (
          <Pressable
            style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
            onPress={onStop}
            hitSlop={8}
            accessibilityLabel="Stop the agent"
          >
            <Square size={13} color={colors.statusRed} strokeWidth={2.4} fill={colors.statusRed} />
            <Text style={styles.stopLabel}>Stop</Text>
          </Pressable>
        ) : null}
      </View>
      {sendErrorMessage ? (
        <View
          style={styles.sendError}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.sendErrorText}>{sendErrorMessage}</Text>
        </View>
      ) : null}
      <MobileNativeChatComposer
        structuredCommands={
          structuredActivityUi ? (sessionOptions?.controller.conversationCommands ?? []) : undefined
        }
        value={composerText}
        onChangeText={onComposerTextChange}
        responseCommentCount={responseComments.length}
        onOpenResponseComments={responseCommentUi.openComments}
        onSend={handleSend}
        sendSurfaceId={sendSurfaceId}
        {...{ getSendCompletionGeneration, getComposerEditGeneration }}
        agent={agent}
        sessionOptions={sessionOptions}
        onAttachImage={onAttachImage}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
        isAttaching={isAttaching}
        onMicPress={onMicPress}
        micActive={micActive}
        dictationMode={dictationMode}
        onMicPressIn={onMicPressIn}
        onMicPressOut={onMicPressOut}
        disabled={lockReason !== null}
        placeholder={mobileNativeChatComposerPlaceholder(lockReason)}
        filePaths={filePaths}
        onNeedFiles={onNeedFiles}
      />
      {responseCommentUi.drawers}
    </View>
  )
}
