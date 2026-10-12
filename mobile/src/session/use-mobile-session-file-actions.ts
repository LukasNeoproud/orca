import { useRef, useCallback, useState } from 'react'
import { useClipboardWriter } from '../platform/clipboard'
import { openExternalLink } from '../platform/external-link'
import { triggerError, triggerSuccess } from '../platform/haptics'
import type { MobileMarkdownLinkTarget } from '../components/MobileMarkdown'
import type { TerminalLinkActionTarget } from '../terminal/terminal-webview-contract'
import type { MobileTerminalLinkOpenMode } from '../storage/preferences'
import { useMobileFileTapHandlers } from './use-mobile-file-tap-handlers'
import { resolveMobileNativeChatFileSessionId } from './mobile-native-chat-eligibility'
import { activateOpenedSourceControlDiffTab } from './opened-mobile-session-tab'
import type { MobileSessionTab } from './mobile-session-route-types'
import type { MobileSessionTerminalSendActionsModel } from './use-mobile-session-terminal-send-actions'
import {
  mobileLinkActionDestination,
  type MobileLinkActionTarget
} from './mobile-link-action-target'

export function useMobileSessionFileActions(scope: MobileSessionTerminalSendActionsModel) {
  const {
    hostId,
    worktreeId,
    routeWorktreeName,
    isFloatingWorkspaceRoute,
    client,
    sessionTabsRef,
    terminalLinkOpenMode,
    activeSessionTabIdRef,
    terminalCwdRef,
    activeHandleRef,
    activeSessionTab,
    activeSessionTabTypeRef,
    switchSessionTabRef,
    handleCreateBrowserRef,
    scheduleDelayedAction,
    nativeChatSendError,
    fetchSessionTabs,
    nativeChatController,
    setInput,
    showToast
  } = scope
  const nativeChatSessionId = resolveMobileNativeChatFileSessionId(activeSessionTab)
  // Tap a terminal or chat file path → resolve on host, open as file tab/preview.
  const { handleFileTap, handleNativeChatFileTap, handleFilePreview, handleNativeChatFilePreview } =
    useMobileFileTapHandlers<MobileSessionTab>({
      client,
      hostId,
      worktreeId,
      worktreeName: routeWorktreeName,
      nativeChatSessionId,
      activeHandleRef,
      terminalCwdRef,
      openBrowser: (url) => void handleCreateBrowserRef.current?.(url),
      fetchSessionTabs,
      getSessionTabs: () => sessionTabsRef.current,
      getActiveSessionTabId: () => activeSessionTabIdRef.current,
      getActiveSessionTabType: () => activeSessionTabTypeRef.current,
      switchSessionTab: (tab) => switchSessionTabRef.current?.(tab),
      scheduleDelayedAction,
      reportChatTapFailure: nativeChatSendError.show
    })

  const handleOpenedFileDiffActivationSeqRef = useRef(0)
  // Capture active tab at tap time; reading it after openDiff would misread a mid-RPC switch and let the retry steal focus.
  const fileOpenStartActiveTabIdRef = useRef<string | null>(null)
  const handleFileOpenStart = useCallback(() => {
    fileOpenStartActiveTabIdRef.current = activeSessionTabIdRef.current
  }, [])
  const handleOpenedFileDiff = useCallback(
    (relativePath: string) => {
      const activationSeq = ++handleOpenedFileDiffActivationSeqRef.current
      const activeTabIdAtTap = fileOpenStartActiveTabIdRef.current

      let activated = false
      const activateOpenedTab = async (): Promise<void> => {
        // Route matching through the shared helper so the repro test exercises the same logic production runs.
        const settled = await activateOpenedSourceControlDiffTab<MobileSessionTab>({
          relativePath,
          activeTabIdAtTap,
          fetchSessionTabs,
          getTabs: () => sessionTabsRef.current,
          getActiveTabId: () => activeSessionTabIdRef.current,
          getActivationState: () => ({
            activated,
            activationSeq,
            latestActivationSeq: handleOpenedFileDiffActivationSeqRef.current
          }),
          switchSessionTab: (tab) => switchSessionTabRef.current?.(tab)
        })
        if (settled) {
          activated = true
        }
      }

      scheduleDelayedAction(() => void activateOpenedTab(), 300)
      scheduleDelayedAction(() => void activateOpenedTab(), 900)
      scheduleDelayedAction(() => void activateOpenedTab(), 1800)
    },
    [fetchSessionTabs, scheduleDelayedAction]
  )

  const openWebLink = useCallback(
    (url: string, mode: MobileTerminalLinkOpenMode) => {
      // Why: browser.tabCreate resolves a real worktree, which the floating
      // sentinel doesn't have — open taps in the phone browser instead.
      if (!/^https?:\/\//i.test(url) || mode === 'phone-browser' || isFloatingWorkspaceRoute) {
        openExternalLink(url)
        return
      }
      void handleCreateBrowserRef.current?.(url)
    },
    [isFloatingWorkspaceRoute]
  )

  const handleTerminalOpenUrl = useCallback(
    (handle: string, url: string) => {
      if (handle !== activeHandleRef.current) {
        return
      }
      openWebLink(url, terminalLinkOpenMode)
    },
    [openWebLink, terminalLinkOpenMode]
  )

  const handleNativeChatOpenUrl = useCallback(
    (url: string) => openWebLink(url, terminalLinkOpenMode),
    [openWebLink, terminalLinkOpenMode]
  )
  const [linkActionTarget, setLinkActionTarget] = useState<MobileLinkActionTarget | null>(null)
  const handleTerminalLinkActions = useCallback(
    (handle: string, target: TerminalLinkActionTarget) => {
      if (handle === activeHandleRef.current) {
        const cwd = terminalCwdRef.current.get(handle)
        setLinkActionTarget({
          ...target,
          source: 'terminal',
          terminalHandle: handle,
          ...(cwd ? { cwd } : {})
        })
      }
    },
    []
  )
  const handleNativeChatLinkActions = useCallback(
    (target: MobileMarkdownLinkTarget) => {
      const tabId = activeSessionTabIdRef.current
      setLinkActionTarget({
        ...target,
        source: 'chat',
        ...(nativeChatSessionId && tabId
          ? { nativeChatContext: { tabId, sessionId: nativeChatSessionId } }
          : {})
      })
    },
    [nativeChatSessionId]
  )
  const dismissLinkActions = useCallback(() => setLinkActionTarget(null), [])
  const openLinkActionFile = useCallback(
    (target: Extract<MobileLinkActionTarget, { kind: 'file' }>) => {
      setLinkActionTarget(null)
      if (target.source === 'terminal') {
        handleFileTap(target.terminalHandle, target.pathText, target.line, target.column)
      } else {
        handleNativeChatFileTap(target.pathText)
      }
    },
    [handleFileTap, handleNativeChatFileTap]
  )
  const previewLinkActionFile = useCallback(
    (target: Extract<MobileLinkActionTarget, { kind: 'file' }>) => {
      setLinkActionTarget(null)
      if (target.source === 'terminal') {
        handleFilePreview(target.terminalHandle, target.pathText, target.line, target.column)
      } else {
        handleNativeChatFilePreview(target.pathText)
      }
    },
    [handleFilePreview, handleNativeChatFilePreview]
  )
  const openLinkActionWeb = useCallback(
    (
      target: Extract<MobileLinkActionTarget, { kind: 'web' }>,
      mode: MobileTerminalLinkOpenMode
    ) => {
      setLinkActionTarget(null)
      openWebLink(target.url, mode)
    },
    [openWebLink]
  )
  const clipboard = useClipboardWriter()
  const copyLinkActionDestination = useCallback(
    (target: MobileLinkActionTarget) => {
      setLinkActionTarget(null)
      void clipboard
        .writeText(mobileLinkActionDestination(target))
        .then(() => {
          triggerSuccess()
          showToast(target.kind === 'file' ? 'Path copied' : 'Link copied')
        })
        .catch(() => {
          triggerError()
          showToast("Couldn't copy", 1500)
        })
    },
    [clipboard, showToast]
  )
  const addLinkActionToMessage = useCallback(
    (target: MobileLinkActionTarget) => {
      setLinkActionTarget(null)
      const destination = mobileLinkActionDestination(target)
      const append = (current: string) =>
        current.length === 0 || /\s$/.test(current)
          ? `${current}${destination}`
          : `${current} ${destination}`
      if (target.source === 'chat' || nativeChatController.showNativeChatRef.current) {
        nativeChatController.setChatComposerText(append)
      } else {
        setInput(append)
      }
      triggerSuccess()
      showToast('Added to message')
    },
    [nativeChatController, setInput, showToast]
  )
  return {
    handleFileTap,
    handleNativeChatFileTap,
    handleOpenedFileDiffActivationSeqRef,
    fileOpenStartActiveTabIdRef,
    handleFileOpenStart,
    handleOpenedFileDiff,
    handleTerminalOpenUrl,
    handleNativeChatOpenUrl,
    handleTerminalLinkActions,
    handleNativeChatLinkActions,
    linkActionTarget,
    dismissLinkActions,
    openLinkActionFile,
    previewLinkActionFile,
    openLinkActionWeb,
    copyLinkActionDestination,
    addLinkActionToMessage
  }
}

export type MobileSessionFileActionsModel = MobileSessionTerminalSendActionsModel &
  ReturnType<typeof useMobileSessionFileActions>
