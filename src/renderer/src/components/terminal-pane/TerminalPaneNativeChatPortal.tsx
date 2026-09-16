import { createPortal } from 'react-dom'
import NativeChatView from '../native-chat/NativeChatView'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { canContinueAgentSessionInNewSession } from './terminal-agent-session-continuation'
import type { TerminalPaneController } from './use-terminal-pane-controller'
import { useAppStore } from '@/store'
import { resolvePaneAgentSessionId } from './pane-agent-session-id'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'

type RetainedPane = TerminalPaneController['retainedChatPaneProjections'][number]

function RetainedNativeChatPanePortal({
  controller,
  projection
}: {
  controller: TerminalPaneController
  projection: RetainedPane
}): React.JSX.Element {
  const {
    chatLeafId,
    contextMenu,
    effectiveChatViewMode,
    expandedPaneId,
    isRendererVisible,
    managedPanes,
    readNativeChatTerminalScreen,
    resolveAgentForLeaf,
    structuredChatTarget,
    switchNativeChatToTerminal,
    tabId,
    unifiedTabId,
    worktreeId
  } = controller
  const { pane } = projection
  const paneKey = makePaneKey(tabId, pane.leafId)
  const isActive = effectiveChatViewMode && chatLeafId === pane.leafId
  const paneSessionId = useAppStore((state) => resolvePaneAgentSessionId(state, paneKey))
  const knownProviderSession = useAppStore(
    (state) =>
      state.agentLaunchConfigByPaneKey[paneKey]?.identity.providerSession ??
      (projection.ownsTabWideLaunchDraft
        ? (state.automaticAgentResumeClaimsByTabId[tabId]?.providerSession ??
          state.pendingStartupByTabId[tabId]?.resumeProviderSession)
        : undefined)
  )
  const bridgeRetentionIdentity = useAppStore(
    (state) => `${getExecutionHostIdForWorktree(state, worktreeId)}\0${worktreeId}`
  )
  const contextMenuActions = {
    onSplitRight: () => contextMenu.runForPane(pane.id, contextMenu.onSplitRight),
    onSplitDown: () => contextMenu.runForPane(pane.id, contextMenu.onSplitDown),
    canEqualizePaneSizes: managedPanes.length > 1 && expandedPaneId === null,
    onEqualizePaneSizes: () => contextMenu.runForPane(pane.id, contextMenu.onEqualizePaneSizes),
    canExpandPane: managedPanes.length > 1,
    isPaneExpanded: expandedPaneId === pane.id,
    onToggleExpand: () => contextMenu.runForPane(pane.id, contextMenu.onToggleExpand),
    canContinueAgentSessionInNewSession: canContinueAgentSessionInNewSession(
      resolveAgentForLeaf(pane.leafId)
    ),
    onContinueAgentSessionInNewSession: () =>
      contextMenu.runForPane(pane.id, contextMenu.onContinueAgentSessionInNewSession),
    onForkAgentSession: () => void contextMenu.runForPane(pane.id, contextMenu.onForkAgentSession),
    onSetTitle: () => contextMenu.runForPane(pane.id, contextMenu.onSetTitle),
    onCopyTerminalId: () => void contextMenu.runForPane(pane.id, contextMenu.onCopyTerminalId),
    onCopyPaneId: () => void contextMenu.runForPane(pane.id, contextMenu.onCopyPaneId),
    canCopyAgentSessionId: paneSessionId !== null,
    onCopyAgentSessionId: () =>
      void contextMenu.runForPane(pane.id, contextMenu.onCopyAgentSessionId),
    canClosePane: managedPanes.length > 1,
    onClosePane: () => contextMenu.runForPane(pane.id, contextMenu.onClosePane)
  }

  return createPortal(
    <div
      className="native-chat-pane-shell absolute inset-0 z-10 min-h-0 min-w-0 bg-background"
      style={{ display: isActive ? 'flex' : 'none' }}
      aria-hidden={!isActive}
    >
      {projection.structuredSessionId && projection.structuredSessionAgent ? (
        <NativeChatView
          mode="structured"
          tabId={unifiedTabId ?? tabId}
          sessionId={projection.structuredSessionId}
          agent={projection.structuredSessionAgent}
          isVisible={isRendererVisible && isActive}
          target={structuredChatTarget}
          composerPaneKey={paneKey}
          contextMenuActions={contextMenuActions}
        />
      ) : (
        <NativeChatView
          terminalTabId={tabId}
          isVisible={isRendererVisible && isActive}
          paneKey={paneKey}
          targetPtyId={projection.ptyId}
          launchAgent={projection.launchAgent}
          resolvedAgent={projection.resolvedAgent}
          ownsTabWideLaunchDraft={projection.ownsTabWideLaunchDraft}
          onSwitchToTerminal={switchNativeChatToTerminal}
          readTerminalScreen={readNativeChatTerminalScreen}
          contextMenuActions={contextMenuActions}
          terminalContext={
            unifiedTabId
              ? {
                  worktreeId,
                  unifiedTabId,
                  singlePane: managedPanes.length === 1,
                  retentionIdentity: bridgeRetentionIdentity,
                  ...(knownProviderSession ? { knownProviderSession } : {})
                }
              : undefined
          }
        />
      )}
    </div>,
    pane.container,
    `native-chat-${tabId}-${pane.leafId}`
  )
}

export function TerminalPaneNativeChatPortal({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  if (controller.retainedChatPaneProjections.length === 0) {
    return null
  }
  return (
    <>
      {controller.retainedChatPaneProjections.map((projection) => (
        <RetainedNativeChatPanePortal
          key={projection.pane.leafId}
          controller={controller}
          projection={projection}
        />
      ))}
    </>
  )
}
