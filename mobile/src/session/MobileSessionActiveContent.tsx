import { Animated, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { saveTerminalTextScale } from '../storage/preferences'
import { MobileBrowserPane } from '../browser/MobileBrowserPane'
import { MobilePersistentEmulatorPanes } from './MobilePersistentEmulatorPanes'
import { MobileMarkdownLinkHandlerProvider } from '../components/MobileMarkdown'
import { TerminalPaneView } from './TerminalPaneView'
import { MobileNativeChatOverlay } from './MobileNativeChatOverlay'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-session-styles'
import type { MobileSessionController } from './use-mobile-session-controller'
import { FileReader } from './MobileSessionFileReader'
import { MarkdownReader } from './MobileSessionMarkdownReader'
import { mobileNativeChatScopeKey } from './mobile-native-chat-scope-key'

export function MobileSessionActiveContent({
  controller
}: {
  controller: MobileSessionController
}) {
  const {
    worktreeId,
    insets,
    connState,
    client,
    terminals,
    terminalTextScale,
    setTerminalTextScale,
    activeHandle,
    markdownDocs,
    fileDocs,
    diffComments,
    diffCommentBusy,
    createError,
    setCreateError,
    setShowCreateTabDrawer,
    dictationMode,
    toastMessage,
    terminalFrameHeightRef,
    setTerminalFrameWidth,
    handleTerminalTap,
    browserScreencastSupported,
    showToast,
    nativeChatSendError,
    nativeChatOverlayInputLockReason,
    nativeChatController,
    dictation,
    handleDictationToggle,
    handleDictationPressIn,
    handleDictationPressOut,
    readMarkdownTab,
    addDiffCommentForFile,
    deleteDiffCommentForFile,
    copyDiffCommentsToClipboard,
    sendDiffCommentsToAgent,
    updateMarkdownLocalContent,
    copyMarkdownLocalContent,
    discardMarkdownLocalContent,
    saveMarkdownTab,
    notifyTerminalFrameHeight,
    setTerminalWebViewRef,
    handleTerminalWebReady,
    handleFileTap,
    handleNativeChatFileTap,
    handleTerminalOpenUrl,
    handleNativeChatOpenUrl,
    handleTerminalLinkActions,
    handleNativeChatLinkActions,
    handleTerminalInput,
    handleTerminalQueryReply,
    handleSelectionMode,
    handleSelectionCopy,
    handleSelectionEvicted,
    handleModesChanged,
    handleKeyboardAvoidanceMetrics,
    handleHaptic,
    nativeChatImages,
    activeMarkdownTab,
    activeFileTab,
    activeBrowserTab,
    activeEmulatorTab,
    activeSessionTabId,
    localEmulatorTabs,
    appActive,
    activePendingTerminalTab,
    isPendingTerminalRecoveryParked,
    retryPendingTerminalRecovery,
    showLoadingState,
    showEmptyState,
    keyboardLift,
    activeTerminalKeyboardLift,
    toastAnimatedStyle,
    createTabBusy
  } = controller
  const content = showLoadingState ? (
    <View style={styles.emptyState}>
      <ActivityIndicator size="small" color={colors.textSecondary} />
    </View>
  ) : showEmptyState ? (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>No tabs in this session</Text>
      {createError ? <Text style={styles.createError}>{createError}</Text> : null}
      <View style={styles.emptyActions}>
        <Pressable
          style={[
            styles.createButton,
            (createTabBusy || connState !== 'connected') && styles.createButtonDisabled
          ]}
          disabled={createTabBusy || connState !== 'connected'}
          onPress={() => {
            setCreateError('')
            setShowCreateTabDrawer(true)
          }}
        >
          <Text style={styles.createButtonText}>
            {createTabBusy ? 'Creating...' : 'Create Tab'}
          </Text>
        </Pressable>
      </View>
    </View>
  ) : activeEmulatorTab ? (
    <View style={{ flex: 1 }} />
  ) : activeMarkdownTab ? (
    <View style={styles.markdownFrame}>
      <MarkdownReader
        documentId={activeMarkdownTab.id}
        doc={markdownDocs.get(activeMarkdownTab.id)}
        onRefresh={() => void readMarkdownTab(activeMarkdownTab)}
        onChange={(content) => updateMarkdownLocalContent(activeMarkdownTab.id, content)}
        onSave={() => void saveMarkdownTab(activeMarkdownTab)}
        onCopy={() => void copyMarkdownLocalContent(activeMarkdownTab.id)}
        onDiscard={() => discardMarkdownLocalContent(activeMarkdownTab)}
        keyboardLift={keyboardLift}
      />
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  ) : activeFileTab ? (
    <View style={styles.markdownFrame}>
      <FileReader
        doc={fileDocs.get(activeFileTab.id)}
        title={activeFileTab.title || 'File'}
        relativePath={activeFileTab.relativePath}
        language={activeFileTab.language}
        diffCommentActions={
          activeFileTab.diffSource === 'staged' || activeFileTab.diffSource === 'unstaged'
            ? {
                comments: diffComments,
                busy: diffCommentBusy,
                onAdd: addDiffCommentForFile,
                onDelete: deleteDiffCommentForFile,
                onCopyAll: copyDiffCommentsToClipboard,
                onSendAll: sendDiffCommentsToAgent
              }
            : undefined
        }
      />
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  ) : activeBrowserTab ? (
    <View style={styles.browserFrame}>
      {/* Why: pane owns imperative frame refs; don't render a stale frame while the old stream effect cleans up. */}
      <MobileBrowserPane
        key={activeBrowserTab.browserPageId ?? activeBrowserTab.id}
        client={client}
        worktreeId={worktreeId}
        tab={activeBrowserTab}
        screencastSupported={browserScreencastSupported}
        keyboardLift={keyboardLift}
        bottomInset={insets.bottom}
        onToast={showToast}
      />
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  ) : activePendingTerminalTab ? (
    <View style={styles.emptyState}>
      {!isPendingTerminalRecoveryParked && (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      )}
      <Text style={styles.emptyText}>
        {isPendingTerminalRecoveryParked
          ? 'Terminal is taking longer than expected'
          : activePendingTerminalTab.title || 'Loading terminal'}
      </Text>
      {isPendingTerminalRecoveryParked && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading terminal"
          style={({ pressed }) => [styles.createButton, pressed && styles.newTerminalButtonPressed]}
          onPress={() => void retryPendingTerminalRecovery()}
        >
          <Text style={styles.createButtonText}>Retry</Text>
        </Pressable>
      )}
    </View>
  ) : (
    <View
      style={styles.terminalFrame}
      onLayout={(e) => {
        terminalFrameHeightRef.current = e.nativeEvent.layout.height
        // Why: notify height imperatively so dock settling re-fits the PTY without rerendering SessionScreen.
        const nextWidth = Math.round(e.nativeEvent.layout.width)
        const nextHeight = Math.round(e.nativeEvent.layout.height)
        setTerminalFrameWidth((prev) => (prev === nextWidth ? prev : nextWidth))
        notifyTerminalFrameHeight(nextHeight)
      }}
    >
      {terminals.map((terminal) => (
        <TerminalPaneView
          key={terminal.handle}
          handle={terminal.handle}
          active={terminal.handle === activeHandle}
          keyboardLift={terminal.handle === activeHandle ? activeTerminalKeyboardLift : 0}
          terminalTheme={terminal.terminalTheme}
          textScale={terminalTextScale}
          onTextScaleChange={(scale) => {
            // Why: pinch-to-zoom reports a new preset; persist it so the size sticks across panes and launches.
            setTerminalTextScale(scale)
            void saveTerminalTextScale(scale)
          }}
          onRef={setTerminalWebViewRef}
          onWebReady={handleTerminalWebReady}
          onSelectionMode={handleSelectionMode}
          onSelectionCopy={handleSelectionCopy}
          onSelectionEvicted={handleSelectionEvicted}
          onModesChanged={handleModesChanged}
          onKeyboardAvoidanceMetrics={handleKeyboardAvoidanceMetrics}
          onHaptic={handleHaptic}
          onTerminalInput={handleTerminalInput}
          onTerminalQueryReply={handleTerminalQueryReply}
          onTerminalTap={handleTerminalTap}
          onFileTap={handleFileTap}
          onOpenUrl={handleTerminalOpenUrl}
          onLinkActions={handleTerminalLinkActions}
        />
      ))}
      <MobileMarkdownLinkHandlerProvider
        value={{
          onOpenUrl: handleNativeChatOpenUrl,
          onShowLinkActions: handleNativeChatLinkActions
        }}
      >
        <MobileNativeChatOverlay
          controller={nativeChatController}
          client={client}
          hostId={controller.hostId}
          worktreeId={worktreeId}
          structuredSessionId={
            controller.activeSessionTab?.type === 'agent-session'
              ? controller.activeSessionTab.sessionId
              : null
          }
          onContinuationOpened={async (sessionId) => {
            const tabId = `agent-session:${sessionId}`
            const targetScope = mobileNativeChatScopeKey(controller.hostId, worktreeId, tabId)
            if (targetScope) {
              nativeChatImages.copyAttachmentsToScope(targetScope)
            }
            const previous = controller.activeHandleRef.current
            if (previous) {
              controller.unsubscribeTerminal(previous)
              controller.initializedHandlesRef.current.delete(previous)
            }
            controller.pendingActiveSessionTabIdRef.current = tabId
            controller.pendingActiveTerminalHandleRef.current = null
            controller.activeSessionTabTypeRef.current = 'agent-session'
            controller.activeSessionTabIdRef.current = tabId
            controller.setActiveSessionTabId(tabId)
            controller.activeHandleRef.current = null
            controller.setActiveHandle(null)
            controller.scheduleDelayedAction(() => void controller.fetchSessionTabs(), 500)
          }}
          onOpenFile={handleNativeChatFileTap}
          images={nativeChatImages}
          onMicPress={handleDictationToggle}
          micActive={dictation.isRecording}
          dictationMode={dictationMode}
          onMicPressIn={handleDictationPressIn}
          onMicPressOut={handleDictationPressOut}
          inputLockReason={nativeChatOverlayInputLockReason}
          sendErrorMessage={nativeChatSendError.message}
          onClearSendError={nativeChatSendError.clear}
          sendSurfaceId={controller.nativeChatScopeKey ?? ''}
          getSendCompletionGeneration={controller.getSendCompletionGeneration}
          keyboardInset={keyboardLift}
        />
      </MobileMarkdownLinkHandlerProvider>
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  )
  return (
    <View style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {content}
      <MobilePersistentEmulatorPanes
        tabs={localEmulatorTabs}
        activeTabId={activeSessionTabId}
        client={client}
        appActive={appActive}
      />
    </View>
  )
}
