import { Pressable, StyleSheet, Text, View } from 'react-native'
import { RotateCcw } from 'lucide-react-native'
import type { useMobileStructuredSendRetry } from './use-mobile-structured-send-retry'
import { colors, spacing, typography } from '../theme/mobile-theme'

export function MobileStructuredSendRetryStatus({
  retry
}: {
  retry: ReturnType<typeof useMobileStructuredSendRetry> | null
}): React.JSX.Element | null {
  if (!retry || (retry.retryable.length === 0 && !retry.error)) {
    return null
  }
  return (
    <View style={styles.container}>
      {retry.retryable.map((entry) => (
        <View key={entry.operationId} style={styles.row}>
          <Text style={styles.message}>Message delivery is unconfirmed.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry unconfirmed message"
            disabled={!retry.canRetry || retry.pendingId !== null}
            onPress={() => void retry.retry(entry.operationId)}
            style={styles.button}
          >
            <RotateCcw size={13} color={colors.textPrimary} />
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      ))}
      {retry.error ? <Text style={styles.error}>{retry.error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  row: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  message: { flex: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  button: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.xs },
  buttonText: { color: colors.textPrimary, fontSize: typography.metaSize },
  error: { color: colors.statusRed, fontSize: typography.metaSize }
})
