import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import {
  canCancelMobileStructuredContextRequest,
  latestMobileStructuredContextRequest,
  mobileStructuredContextStatusLabel,
  type MobileStructuredContextRequest,
  type MobileStructuredContextSnapshot,
  type MobileStructuredContextSource
} from './mobile-structured-context-transition'
import { useMobileStructuredContextTransitions } from './use-mobile-structured-context-transitions'

type Props = {
  client: RpcClient | null
  connectionState: ConnectionState
  hostCapabilities: readonly string[]
  sessions: readonly AiVaultSession[]
  worktreeId: string
}

export function MobileStructuredContextTransitions(props: Props): React.JSX.Element | null {
  const state = useMobileStructuredContextTransitions(props)
  if (state.sources.length === 0) {
    return null
  }
  if (!state.supported) {
    return (
      <Notice
        title="Context changes unavailable"
        message="Update Orca on this host to view and control structured context changes. Terminal context changes remain unavailable on mobile."
      />
    )
  }

  const rows = state.snapshots.flatMap(({ snapshot, source }) => {
    const request = latestMobileStructuredContextRequest(snapshot.requests)
    return request ? [{ request, snapshot, source }] : []
  })
  if (rows.length === 0 && !state.error) {
    return null
  }

  return (
    <View style={styles.group} accessibilityLabel="Structured context changes">
      {state.connectionState !== 'connected' ? (
        <Notice
          title="Context status unavailable"
          message="Reconnect to the owning host before treating this context change as completed."
        />
      ) : null}
      {state.error ? (
        <Notice title="Unable to confirm context status" message={state.error} />
      ) : null}
      {rows.map(({ request, snapshot, source }) => (
        <TransitionCard
          key={`${source.sessionId}:${request.requestId}`}
          source={source}
          snapshot={snapshot}
          request={request}
          connected={state.connectionState === 'connected'}
          canceling={state.cancelingRequestId === request.requestId}
          onCancel={() => void state.cancel(source, request)}
        />
      ))}
    </View>
  )
}

function TransitionCard(props: {
  source: MobileStructuredContextSource
  snapshot: MobileStructuredContextSnapshot
  request: MobileStructuredContextRequest
  connected: boolean
  canceling: boolean
  onCancel: () => void
}): React.JSX.Element {
  const { connected, request, snapshot, source } = props
  const ownerVerified = snapshot.ownerState === 'live'
  const cancellable =
    connected && ownerVerified && canCancelMobileStructuredContextRequest(request.status)
  const progress =
    connected && snapshot.ownerState !== 'unverifiable'
      ? mobileStructuredContextStatusLabel(request.status)
      : 'Owning host state is unverifiable; completion is not confirmed'
  return (
    <View style={styles.card} accessibilityLabel={`Context change for ${source.title}`}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Structured context change</Text>
          <Text style={styles.title} numberOfLines={1}>
            {source.title}
          </Text>
        </View>
        <Text style={statusStyle(request.status)}>{progress}</Text>
      </View>
      <Text style={styles.mode}>
        {request.mode === 'compact' ? 'Compact context' : 'New context with checkpoint'}
      </Text>
      <Text style={styles.reason}>{request.reason}</Text>
      {request.status === 'completed' && request.result?.newSessionId ? (
        <Text style={styles.detail}>The new structured tab is available on this host.</Text>
      ) : null}
      {cancellable ? (
        <Pressable
          style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
          disabled={props.canceling}
          accessibilityRole="button"
          accessibilityLabel={`Cancel context change for ${source.title}`}
          onPress={props.onCancel}
        >
          {props.canceling ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.cancelText}>Cancel context change</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}

function Notice({ title, message }: { title: string; message: string }): React.JSX.Element {
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  )
}

function statusStyle(status: MobileStructuredContextRequest['status']) {
  if (status === 'completed') {
    return [styles.status, styles.statusSuccess]
  }
  if (status === 'failed' || status === 'stale') {
    return [styles.status, styles.statusError]
  }
  if (status === 'unconfirmed') {
    return [styles.status, styles.statusWarning]
  }
  return styles.status
}

const styles = StyleSheet.create({
  group: { marginHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleBlock: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  title: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  status: {
    maxWidth: '48%',
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    textAlign: 'right'
  },
  statusSuccess: { color: colors.statusGreen },
  statusWarning: { color: colors.statusAmber },
  statusError: { color: colors.statusRed },
  mode: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  reason: { color: colors.textSecondary, fontSize: typography.metaSize },
  detail: { color: colors.textMuted, fontSize: typography.metaSize },
  cancelButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  cancelButtonPressed: { opacity: 0.78 },
  cancelText: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  notice: {
    padding: spacing.sm,
    gap: 2,
    borderRadius: radii.input,
    backgroundColor: colors.bgPanel
  },
  noticeTitle: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  noticeText: { color: colors.textSecondary, fontSize: typography.metaSize }
})
