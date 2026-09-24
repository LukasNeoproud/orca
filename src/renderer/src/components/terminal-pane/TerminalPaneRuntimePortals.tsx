import { createPortal } from 'react-dom'
import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import CodexRestartChip from '../CodexRestartChip'
import { ConversationContinuationPanel } from '@/components/agent-session-continuation/ConversationContinuationPanel'
import { TerminalSshReconnectOverlay } from './TerminalSshReconnectOverlay'
import { TerminalRemoteRuntimeReconnectBanner } from './TerminalRemoteRuntimeReconnectBanner'
import { TerminalProcessExitOverlay } from './TerminalProcessExitOverlay'
import { MobileDriverOverlay } from './MobileDriverOverlay'
import { getDriverForPty } from '@/lib/pane-manager/mobile-driver-state'
import { getFitOverrideForPty } from '@/lib/pane-manager/mobile-fit-overrides'
import { shouldShowMobileDriverOverlay } from './mobile-driver-overlay-visibility'
import { shouldChatTakeOverMobileSurface } from '../native-chat/native-chat-send-eligibility'
import type { TerminalPaneController } from './use-terminal-pane-controller'
import { useAppStore } from '@/store'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import {
  createCodexConversationContinuationSource,
  isCodexConversationContinuationBusy,
  type CodexConversationContinuationSource
} from './codex-conversation-continuation-source'
import { useAgentContextTransition } from './use-agent-context-transition'
import { AgentContextRequestStatus } from '@/components/agent-session-continuation/AgentContextRequestStatus'
import { useAgentContextOwnerAvailable } from '@/components/agent-session-continuation/use-agent-context-owner-capability'

function continuationSourceMatches(
  left: CodexConversationContinuationSource | null,
  right: CodexConversationContinuationSource
): boolean {
  return (
    left?.paneKey === right.paneKey &&
    left.providerSessionId === right.providerSessionId &&
    left.target.kind === right.target.kind &&
    (left.target.kind !== 'environment' ||
      (right.target.kind === 'environment' &&
        left.target.environmentId === right.target.environmentId))
  )
}

function CodexConversationContinuationPortal({
  controller,
  pane
}: {
  controller: TerminalPaneController
  pane: TerminalPaneController['managedPanes'][number]
}): React.JSX.Element | null {
  const {
    codexConversationContinuation,
    restartCodexConversationPane,
    setCodexConversationContinuation,
    tabId,
    worktreeId
  } = controller
  const paneKey = useMemo(() => makePaneKey(tabId, pane.leafId), [pane.leafId, tabId])
  const sourceInputs = useAppStore(
    useShallow((state) => ({
      status: state.agentStatusByPaneKey[paneKey],
      environmentId: getRuntimeEnvironmentIdForWorktree(state, worktreeId),
      connectionId: getConnectionIdFromState(state, worktreeId),
      agentContextEnabled:
        state.settings?.agentContextAutonomy === 'compact' ||
        state.settings?.agentContextAutonomy === 'all'
    }))
  )
  const source = useMemo(
    () =>
      createCodexConversationContinuationSource(sourceInputs, {
        pane,
        tabId,
        worktreeId
      }),
    [pane, sourceInputs, tabId, worktreeId]
  )
  const busy = useAppStore((state) => isCodexConversationContinuationBusy(state, { pane, tabId }))
  const agentContextEnabled = useAgentContextOwnerAvailable(
    source?.target ?? null,
    sourceInputs.agentContextEnabled
  )
  const agentContextTransition = useAgentContextTransition({
    source,
    enabled: agentContextEnabled,
    restartCodexConversationPane
  })
  const expanded =
    source !== null && continuationSourceMatches(codexConversationContinuation, source)
  const onExpandedChange = useCallback(
    (next: boolean) => {
      if (!source) {
        return
      }
      setCodexConversationContinuation((current) =>
        next ? source : continuationSourceMatches(current, source) ? null : current
      )
    },
    [setCodexConversationContinuation, source]
  )
  const onContinue = useCallback(
    async (
      mode: Parameters<typeof restartCodexConversationPane>[0]['mode'],
      candidate?: { providerSessionId: string; transcriptPath: string },
      reference?: string
    ) => {
      if (!source) {
        return
      }
      await restartCodexConversationPane({
        paneId: source.paneId,
        mode,
        sourceProviderSessionId: source.providerSessionId,
        providerSessionId: candidate?.providerSessionId ?? source.providerSessionId,
        transcriptPath: candidate?.transcriptPath ?? source.transcriptPath,
        ...(reference ? { reference } : {})
      })
      setCodexConversationContinuation(null)
    },
    [restartCodexConversationPane, setCodexConversationContinuation, source]
  )
  if (!source) {
    return null
  }
  const portalKey = `${source.paneKey}-${source.providerSessionId}-${source.target.kind === 'environment' ? source.target.environmentId : 'local'}`
  return createPortal(
    <div className="absolute inset-x-0 top-0 z-20">
      <AgentContextRequestStatus source={source} />
      <ConversationContinuationPanel
        key={portalKey}
        source={source}
        busy={busy}
        compact
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onContinue={onContinue}
      />
      {agentContextTransition.phase === 'switching' ? (
        <p className="border-b border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          {agentContextTransition.message}
        </p>
      ) : agentContextTransition.phase === 'failed' ? (
        <p className="border-b border-border bg-background px-3 py-2 text-xs text-destructive">
          {agentContextTransition.message}
        </p>
      ) : null}
    </div>,
    pane.container,
    `codex-conversation-continuation-${portalKey}`
  )
}

/** Each live Codex pane owns one panel, including panes currently covered by native chat. */
export function TerminalPaneCodexConversationContinuationPortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element {
  return (
    <>
      {controller.managedPanes.map((pane) => (
        <CodexConversationContinuationPortal
          key={pane.leafId}
          controller={controller}
          pane={pane}
        />
      ))}
    </>
  )
}

export function TerminalPaneCodexRestartPortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element {
  const { activePane, isActive, isVisible, managedPanes, paneTransportsRef, savedLayout } =
    controller
  return (
    <>
      {managedPanes.map((pane) => {
        const ptyId =
          paneTransportsRef.current.get(pane.id)?.getPtyId() ??
          savedLayout.ptyIdsByLeafId?.[pane.leafId]
        if (!ptyId) {
          return null
        }
        return createPortal(
          <CodexRestartChip
            key={`codex-restart-${pane.id}-${ptyId}`}
            isVisible={isVisible}
            ptyId={ptyId}
            shouldFocus={isActive && isVisible && activePane?.id === pane.id}
          />,
          pane.container,
          `codex-restart-${pane.id}`
        )
      })}
    </>
  )
}

export function TerminalPaneProcessExitPortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  const {
    handleCloseExitedPane,
    handleRestartExitedPane,
    isActive,
    managedPanes,
    paneProcessExitsByPaneId
  } = controller
  if (!isActive) {
    return null
  }
  return (
    <>
      {managedPanes.map((pane) => {
        const processExit = paneProcessExitsByPaneId[pane.id]
        if (!processExit) {
          return null
        }
        return createPortal(
          <TerminalProcessExitOverlay
            processExit={processExit}
            onRestart={() => handleRestartExitedPane(processExit)}
            onClose={() => handleCloseExitedPane(pane.id)}
          />,
          pane.container,
          `process-exit-${pane.id}`
        )
      })}
    </>
  )
}

export function TerminalPaneSshReconnectPortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  const {
    managedPanes,
    showSshReconnectOverlay,
    sshReconnectEnvironmentId,
    sshReconnectError,
    sshReconnectStatus,
    sshReconnectTargetId,
    sshReconnectTargetLabel,
    sshReconnectTargetRemoved,
    worktreeId
  } = controller
  if (!showSshReconnectOverlay || !sshReconnectTargetId || !sshReconnectStatus) {
    return null
  }
  return (
    <>
      {managedPanes.map((pane) =>
        createPortal(
          <TerminalSshReconnectOverlay
            targetId={sshReconnectTargetId}
            targetLabel={sshReconnectTargetLabel}
            status={sshReconnectStatus}
            error={sshReconnectError}
            targetRemoved={sshReconnectTargetRemoved}
            worktreeId={worktreeId}
            sshOwnerEnvironmentId={sshReconnectEnvironmentId}
          />,
          pane.container,
          `ssh-reconnect-${pane.id}`
        )
      )}
    </>
  )
}

export function TerminalPaneRecoveryPortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  const { managedPanes, paneTransportsRef, ptyRecoveryStatesByPaneId, showSshReconnectOverlay } =
    controller
  if (showSshReconnectOverlay) {
    return null
  }
  return (
    <>
      {managedPanes.map((pane) => {
        const recoveryState = ptyRecoveryStatesByPaneId[pane.id]
        if (!recoveryState) {
          return null
        }
        return createPortal(
          <TerminalRemoteRuntimeReconnectBanner
            key={`remote-runtime-reconnect-${pane.id}-${recoveryState.epoch}`}
            phase={recoveryState.phase}
            onReconnect={() => paneTransportsRef.current.get(pane.id)?.retryRecovery?.()}
          />,
          pane.container,
          `remote-runtime-reconnect-${pane.id}`
        )
      })}
    </>
  )
}

export function TerminalPaneMobileDriverPortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element {
  const {
    chatLeafId,
    effectiveChatViewMode,
    managedPanes,
    paneTransportsRef,
    restoreAllTerminalFits,
    restorePaneTerminalFit
  } = controller
  return (
    <>
      {managedPanes.map((pane) => {
        const ptyId = paneTransportsRef.current.get(pane.id)?.getPtyId()
        if (!ptyId) {
          return null
        }
        const driver = getDriverForPty(ptyId)
        const fitMode = getFitOverrideForPty(ptyId)?.mode ?? null
        const hasFitOverride = fitMode === 'mobile-fit'
        if (!shouldShowMobileDriverOverlay(driver.kind, fitMode)) {
          return null
        }
        const paneSurface =
          effectiveChatViewMode && pane.leafId === chatLeafId ? 'chat' : 'terminal'
        if (shouldChatTakeOverMobileSurface(paneSurface)) {
          return null
        }
        return createPortal(
          <MobileDriverOverlay
            key={`mobile-driver-${pane.id}-${ptyId}`}
            driver={driver}
            hasFitOverride={hasFitOverride}
            rootClassName="mobile-driver-banner"
            onAction={() => restorePaneTerminalFit(pane, ptyId)}
            onAllAction={() => restoreAllTerminalFits(pane)}
          />,
          pane.container,
          `mobile-driver-banner-${pane.id}`
        )
      })}
    </>
  )
}
