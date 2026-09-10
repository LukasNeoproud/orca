import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  getExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree
} from '@/lib/worktree-runtime-owner'
import {
  closeStructuredTerminalSessionWithRetry,
  structuredTerminalSessionId
} from '../terminal/structured-terminal-session-disposal'

const pendingCloses = new Set<string>()

function reportStructuredPaneCloseFailure(): void {
  toast.error(
    translate(
      'components.native-chat.structuredSessionCloseFailed',
      'Could not close this chat session'
    ),
    {
      description: translate(
        'components.native-chat.structuredSessionCloseFailedDescription',
        'The terminal stayed open so the provider remains recoverable.'
      )
    }
  )
}

/** The pane stays recoverable until its host confirms the provider has closed. */
export function requestStructuredTerminalPaneClose(args: {
  worktreeId: string
  tabId: string
  paneKey: string
  isPaneCurrent: () => boolean
  onClosed: () => void
}): boolean {
  const state = useAppStore.getState()
  const sessionId = structuredTerminalSessionId(
    state.unifiedTabsByWorktree[args.worktreeId],
    args.tabId,
    args.paneKey
  )
  if (!sessionId) {
    return false
  }
  const closeKey = JSON.stringify([args.worktreeId, args.paneKey, sessionId])
  if (pendingCloses.has(closeKey)) {
    return true
  }
  pendingCloses.add(closeKey)
  const environmentId = getRuntimeEnvironmentIdForWorktree(state, args.worktreeId)
  const target = environmentId
    ? ({ kind: 'environment', environmentId } as const)
    : getExecutionHostIdForWorktree(state, args.worktreeId) === 'local'
      ? ({ kind: 'local' } as const)
      : null

  void (async () => {
    if (!target || !(await closeStructuredTerminalSessionWithRetry(target, sessionId))) {
      reportStructuredPaneCloseFailure()
      return
    }
    let cleared = false
    useAppStore.setState((current) => {
      const tabs = current.unifiedTabsByWorktree[args.worktreeId]
      if (
        !tabs ||
        !args.isPaneCurrent() ||
        structuredTerminalSessionId(tabs, args.tabId, args.paneKey) !== sessionId
      ) {
        return current
      }
      cleared = true
      return {
        unifiedTabsByWorktree: {
          ...current.unifiedTabsByWorktree,
          [args.worktreeId]: tabs.map((tab) => {
            if (tab.contentType !== 'terminal' || tab.entityId !== args.tabId) {
              return tab
            }
            const {
              structuredSessionId: _session,
              structuredSessionPaneKey: _pane,
              agentSessionAgent: _agent,
              ...terminalTab
            } = tab
            return { ...terminalTab, viewMode: 'terminal' as const }
          })
        }
      }
    })
    if (cleared && args.isPaneCurrent()) {
      args.onClosed()
    }
  })()
    .catch(reportStructuredPaneCloseFailure)
    .finally(() => pendingCloses.delete(closeKey))
  return true
}
