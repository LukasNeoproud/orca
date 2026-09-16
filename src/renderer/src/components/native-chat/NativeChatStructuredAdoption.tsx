import { useEffect, useState } from 'react'
import { isAgentSessionHandleProvider } from '../../../../shared/agent-session-provider-handle'
import { hasRuntimeRpcErrorCode } from '../../../../shared/runtime-rpc-error-code'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import {
  adoptStructuredAgentTerminal,
  returnAdoptedTerminalToStructuredChat
} from '@/lib/adopt-structured-agent-terminal'
import { bindStructuredAgentTerminal } from '@/lib/bind-structured-agent-terminal'
import { NativeChatResolvedView } from './NativeChatResolvedView'
import { NativeChatEmptyState } from './NativeChatEmptyState'
import type {
  NativeChatBridgeViewProps,
  NativeChatResolvedViewProps
} from './native-chat-view-types'

type Props = NativeChatResolvedViewProps & {
  terminalContext: NonNullable<NativeChatBridgeViewProps['terminalContext']>
}

export function NativeChatStructuredAdoption(props: Props): React.JSX.Element {
  const { agent, terminalContext, terminalTabId, paneKey, targetPtyId, sessionId, isVisible } =
    props
  const { worktreeId, unifiedTabId, singlePane } = terminalContext
  const enabled = useAppStore((state) => state.settings?.experimentalStructuredNativeChat === true)
  const local = useAppStore((state) => getExecutionHostIdForWorktree(state, worktreeId) === 'local')
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const key = JSON.stringify([paneKey, targetPtyId, sessionId, agent, attempt])
  const supportedAgent = isAgentSessionHandleProvider(agent)
  const canAdopt = enabled && local && singlePane && supportedAgent && Boolean(targetPtyId)
  const error = failure?.key === key ? failure.message : null

  useEffect(() => {
    if (!canAdopt || !isVisible || !targetPtyId || !isAgentSessionHandleProvider(agent)) {
      return
    }
    let disposed = false
    const input = {
      worktreeId,
      agent,
      ...(sessionId ? { providerSessionId: sessionId } : {}),
      terminal: { tabId: terminalTabId, paneKey, ptyId: targetPtyId }
    }
    void adoptStructuredAgentTerminal(input)
      .then((adopted) => {
        if (disposed) {
          return
        }
        let bound = false
        useAppStore.setState((state) => {
          const patch = bindStructuredAgentTerminal(state, { ...input, unifiedTabId }, adopted)
          bound = patch !== null
          return patch ?? state
        })
        if (bound) {
          // The durable binding precedes stopping the TUI, so its exit cannot discard the chat.
          void returnAdoptedTerminalToStructuredChat(adopted).catch((error) =>
            console.warn('[structured-chat] terminal handoff needs retry', error)
          )
        } else {
          setFailure({
            key,
            message: translate(
              'components.native-chat.adoption.changed',
              'The terminal changed before structured chat could open. Try again.'
            )
          })
        }
      })
      .catch((error) => {
        if (!disposed) {
          setFailure({
            key,
            message: hasRuntimeRpcErrorCode(error, 'method_not_found')
              ? translate(
                  'components.native-chat.adoption.restart',
                  'Restart Orca to enable structured chat for existing terminals.'
                )
              : error instanceof Error
                ? error.message
                : String(error)
          })
        }
      })
    return () => {
      disposed = true
    }
  }, [
    agent,
    canAdopt,
    isVisible,
    key,
    paneKey,
    sessionId,
    targetPtyId,
    terminalTabId,
    unifiedTabId,
    worktreeId
  ])

  if (!enabled || !supportedAgent) {
    return <NativeChatResolvedView {...props} />
  }
  if (local && singlePane && !error) {
    return <NativeChatEmptyState kind="loading" />
  }
  if (error) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center pb-6">
        <NativeChatEmptyState kind="error" message={error} />
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {translate('components.native-chat.adoption.retry', 'Retry')}
          </Button>
          {props.onSwitchToTerminal ? (
            <Button variant="ghost" size="sm" onClick={props.onSwitchToTerminal}>
              {translate('components.native-chat.adoption.showTerminal', 'Show terminal')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const reason = !local
    ? translate(
        'components.native-chat.adoption.localOnly',
        'Structured chat cannot take over this remote terminal yet.'
      )
    : translate(
        'components.native-chat.adoption.singlePane',
        'Structured chat currently requires a terminal with one pane.'
      )
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        role="status"
        className="flex items-center gap-3 border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
      >
        <span className="flex-1">{reason}</span>
      </div>
      <div className="min-h-0 flex-1">
        <NativeChatResolvedView {...props} />
      </div>
    </div>
  )
}
