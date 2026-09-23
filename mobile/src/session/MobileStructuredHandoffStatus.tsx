import { Pressable, StyleSheet, Text, View } from 'react-native'
import type {
  AgentSessionHandoffAction,
  AgentSessionHandoffDirection,
  AgentSessionHandoffMode,
  AgentSessionHandoffStatus
} from '../../../src/shared/agent-session-wire'
import { colors, spacing, typography } from '../theme/mobile-theme'

export function MobileStructuredHandoffStatus(props: {
  status: AgentSessionHandoffStatus | null
  pending: boolean
  uncertain: boolean
  error: string | null
  isWorking: boolean
  onRequest: (
    direction: AgentSessionHandoffDirection,
    mode: AgentSessionHandoffMode,
    action?: AgentSessionHandoffAction
  ) => Promise<boolean>
}): React.JSX.Element | null {
  const { status, pending, uncertain, error, isWorking, onRequest } = props
  if (!status || (status.owner === 'native' && status.phase === 'idle' && !error)) {
    return null
  }
  const switching = status.phase === 'switching' || status.phase === 'waiting-for-exit'
  const action =
    status.phase === 'queued' && status.direction
      ? {
          label: 'Cancel',
          direction: status.direction,
          mode: 'after-turn' as const,
          action: 'cancel-queued' as const
        }
      : status.owner === 'tui' && status.phase === 'idle'
        ? {
            label: isWorking ? 'Return after this turn' : 'Return to chat',
            direction: 'to-native' as const,
            mode: 'after-turn' as const,
            action: 'start' as const
          }
        : status.phase === 'failed' &&
            status.direction === 'to-native' &&
            status.error?.canRetryProof
          ? {
              label: 'Retry proof',
              direction: 'to-native' as const,
              mode: 'now' as const,
              action: 'recover' as const
            }
          : status.phase === 'failed' &&
              status.direction === 'to-native' &&
              status.error?.recoverableOwner !== 'none'
            ? {
                label: 'Retry',
                direction: 'to-native' as const,
                mode: 'now' as const,
                action: 'retry' as const
              }
            : null
  const message =
    status.phase === 'queued'
      ? status.direction === 'to-tui'
        ? 'Switching to terminal after this turn.'
        : 'Returning to chat after this turn.'
      : status.phase === 'waiting-for-exit'
        ? 'Exit the agent terminal to continue in chat.'
        : switching
          ? status.stage === 'old-owner-stopped'
            ? 'Resuming chat session…'
            : status.stage === 'new-owner-proving'
              ? 'Verifying chat session…'
              : 'Switching session owner…'
          : status.phase === 'failed'
            ? (status.error?.message ?? 'The session switch failed.')
            : status.owner === 'tui'
              ? status.hostLabel
                ? `Agent is open in terminal on ${status.hostLabel}.`
                : 'Agent is open in terminal.'
              : (error ?? '')
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.title}>
        {switching ? 'Switching' : status.owner === 'tui' ? 'Terminal' : 'Chat'}
      </Text>
      <View style={styles.content}>
        <Text style={[styles.message, status.phase === 'failed' && styles.failure]}>{message}</Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            disabled={pending || uncertain}
            onPress={() => void onRequest(action.direction, action.mode, action.action)}
            style={pending || uncertain ? styles.disabled : undefined}
          >
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.failure}>{error}</Text> : null}
      {status.phase === 'failed' && status.error?.details ? (
        <Text style={styles.details}>{status.error.details}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs
  },
  title: { color: colors.textMuted, fontSize: typography.metaSize, fontWeight: '700' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  message: { flex: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  failure: { color: colors.statusRed, fontSize: typography.metaSize },
  action: {
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    paddingVertical: spacing.xs
  },
  disabled: { opacity: 0.45 },
  details: { color: colors.textMuted, fontSize: typography.metaSize }
})
