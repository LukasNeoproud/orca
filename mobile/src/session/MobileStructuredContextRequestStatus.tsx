import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { AgentContextTransitionStatus } from '../../../src/shared/agent-context-transition'
import type { ConversationContinuationSource } from '../../../src/shared/conversation-continuation'
import { AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'
import type { RpcClient } from '../transport/rpc-client'
import { callAgentSession } from './mobile-structured-agent-session-rpc'

type RequestView = {
  requestId: string
  status: AgentContextTransitionStatus
  reason: string
  mode: 'compact' | 'fresh'
}

export function MobileStructuredContextRequestStatus(props: {
  client: RpcClient
  source: ConversationContinuationSource
}): React.JSX.Element | null {
  const { client, source } = props
  const [supported, setSupported] = useState(false)
  const [request, setRequest] = useState<RequestView | null>(null)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    setSupported(false)
    setRequest(null)
    setError(false)
    return startRuntimeCapabilityProbe(client, (capabilities) => {
      setSupported(capabilities.includes(AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY))
    })
  }, [client, source.providerSessionId, source.workspaceId])
  useEffect(() => {
    if (!supported) {
      return
    }
    let active = true
    let reading = false
    const read = () => {
      if (reading) {
        return
      }
      reading = true
      void callAgentSession<RequestView[]>(client, 'agentContext.inspect', { source })
        .then((rows) => {
          if (active) {
            setRequest(rows[0] ?? null)
          }
        })
        .catch(() => {})
        .finally(() => {
          reading = false
        })
    }
    read()
    const timer = setInterval(read, 2_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [client, source.providerSessionId, source.workspaceId, supported])
  if (!supported || !request) {
    return null
  }
  const cancellable = ['queued', 'ready', 'preparing'].includes(request.status)
  const cancel = async () => {
    if (pending) {
      return
    }
    setPending(true)
    setError(false)
    try {
      setRequest(
        await callAgentSession<RequestView | null>(client, 'agentContext.cancelPending', {
          source,
          requestId: request.requestId
        })
      )
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.title}>
            {request.mode === 'compact' ? 'Compact context' : 'New context with checkpoint'}
          </Text>
          <Text style={styles.detail}>{label(request.status)}</Text>
          <Text style={styles.reason} numberOfLines={2}>
            {request.reason}
          </Text>
        </View>
        {cancellable ? (
          <Pressable accessibilityRole="button" disabled={pending} onPress={() => void cancel()}>
            <Text style={styles.action}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error}>
          Could not cancel the request. Check the connection and try again.
        </Text>
      ) : null}
    </View>
  )
}

function label(status: AgentContextTransitionStatus): string {
  switch (status) {
    case 'queued':
      return 'Waiting for this turn to finish'
    case 'ready':
    case 'preparing':
      return 'Preparing the next context'
    case 'executing':
      return 'Switching context'
    case 'completed':
      return 'Context change completed'
    case 'cancelled':
      return 'Context change cancelled'
    case 'stale':
      return 'Conversation changed — context change cancelled'
    case 'unconfirmed':
      return 'Context change could not be confirmed; it will not be repeated automatically'
    case 'failed':
      return 'Context change failed'
  }
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, gap: spacing.xs },
  title: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: typography.metaSize },
  reason: { color: colors.textMuted, fontSize: typography.metaSize },
  action: { color: colors.textPrimary, fontSize: typography.metaSize, padding: spacing.xs },
  error: { color: colors.statusRed, fontSize: typography.metaSize }
})
