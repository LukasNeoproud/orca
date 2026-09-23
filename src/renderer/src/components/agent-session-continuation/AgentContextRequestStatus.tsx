import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { callConversationRuntimeFeature } from '@/lib/conversation-runtime-rpc'
import { AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { ConversationContinuationSource } from '../../../../shared/conversation-continuation'
import type { AgentContextTransitionStatus } from '../../../../shared/agent-context-transition'
import { Button } from '../ui/button'
import { translate } from '@/i18n/i18n'

type RequestView = {
  requestId: string
  status: AgentContextTransitionStatus
  reason: string
  mode: 'compact' | 'fresh'
}

export function AgentContextRequestStatus({
  source
}: {
  source: ConversationContinuationSource & { target: RuntimeClientTarget }
}): React.JSX.Element | null {
  const enabled = useAppStore(
    (state) =>
      state.settings?.agentContextAutonomy === 'compact' ||
      state.settings?.agentContextAutonomy === 'all'
  )
  const [request, setRequest] = useState<RequestView | null>(null)
  const [error, setError] = useState(false)
  const { workspaceId, providerSessionId, target } = source
  useEffect(() => {
    setRequest(null)
    setError(false)
    if (!enabled) {
      return
    }
    let disposed = false
    let pending = false
    const refresh = async () => {
      if (pending || disposed) {
        return
      }
      pending = true
      try {
        const rows = await callConversationRuntimeFeature<RequestView[]>(
          target,
          AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY,
          'Context management is unavailable on this host.',
          'agentContext.inspect',
          { source: { workspaceId, providerSessionId } }
        )
        if (!disposed) {
          setRequest(rows[0] ?? null)
        }
      } catch {
        // A disconnected host cannot author a new transition state.
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2_000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [enabled, workspaceId, providerSessionId, target])
  if (!request || !enabled) {
    return null
  }
  const cancellable = ['queued', 'ready', 'preparing'].includes(request.status)
  const cancel = async () => {
    setError(false)
    try {
      const result = await callConversationRuntimeFeature<RequestView | null>(
        target,
        AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY,
        'Context management is unavailable on this host.',
        'agentContext.cancelPending',
        { source: { workspaceId, providerSessionId }, requestId: request.requestId }
      )
      setRequest(result)
    } catch {
      setError(true)
    }
  }
  const label = statusLabel(request.status)
  return (
    <div
      className="flex items-center justify-between gap-3 border-b bg-background px-3 py-2 text-xs"
      role="region"
      aria-label={translate('continuation.agent.status', 'Agent context request')}
    >
      <div className="min-w-0">
        <p className="font-medium">
          {request.mode === 'compact'
            ? translate('continuation.agent.compact', 'Compact context')
            : translate('continuation.agent.fresh', 'New context with checkpoint')}
        </p>
        <p role="status">{label}</p>
        <p className="truncate text-muted-foreground" title={request.reason}>
          {request.reason}
        </p>
        {error ? (
          <p role="alert">
            {translate(
              'continuation.agent.cancelFailed',
              'Could not cancel the request. Check the connection and try again.'
            )}
          </p>
        ) : null}
      </div>
      {cancellable ? (
        <Button variant="ghost" size="sm" onClick={() => void cancel()}>
          {translate('continuation.agent.cancel', 'Cancel context change')}
        </Button>
      ) : null}
    </div>
  )
}

function statusLabel(status: AgentContextTransitionStatus): string {
  switch (status) {
    case 'queued':
      return translate(
        'continuation.agent.queued',
        'Context change requested — waiting for this turn to finish'
      )
    case 'ready':
    case 'preparing':
      return translate('continuation.agent.preparing', 'Preparing the next context')
    case 'executing':
      return translate('continuation.agent.executing', 'Switching context')
    case 'completed':
      return translate('continuation.agent.completed', 'Context change completed')
    case 'cancelled':
      return translate('continuation.agent.cancelled', 'Context change cancelled')
    case 'stale':
      return translate(
        'continuation.agent.stale',
        'Conversation changed — context change cancelled'
      )
    case 'unconfirmed':
      return translate(
        'continuation.agent.unconfirmed',
        'Context change could not be confirmed; it will not be repeated automatically'
      )
    case 'failed':
      return translate('continuation.agent.failed', 'Context change failed')
  }
}
