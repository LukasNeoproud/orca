import * as Clipboard from 'expo-clipboard'
import { AlertTriangle, Copy } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { WorktreeCheckoutWarning } from '../../../src/shared/worktree/checkout-warning'
import { formatMobileCheckoutWarning } from '../tasks/worktree-checkout-warning'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { BottomDrawer } from './BottomDrawer'

export function NewWorktreeCheckoutRecoverySheet({
  warning,
  prompt,
  note,
  onOpen
}: {
  warning: WorktreeCheckoutWarning
  prompt: string
  note: string
  onOpen: () => void
}) {
  return (
    <BottomDrawer visible onClose={onOpen}>
      <View style={styles.content}>
        <AlertTriangle size={22} color={colors.statusAmber} />
        <Text style={styles.title}>Workspace created with a warning</Text>
        <Text style={styles.message}>{formatMobileCheckoutWarning(warning)}</Text>
        {prompt ? (
          <>
            <Text style={styles.noteLabel}>Original agent prompt</Text>
            <Text style={styles.note} selectable>
              {prompt}
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void Clipboard.setStringAsync(prompt)}
              accessibilityRole="button"
            >
              <Copy size={16} color={colors.textPrimary} />
              <Text style={styles.secondaryText}>Copy prompt</Text>
            </Pressable>
          </>
        ) : null}
        {note ? (
          <>
            <Text style={styles.noteLabel}>Original note</Text>
            <Text style={styles.note} selectable>
              {note}
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void Clipboard.setStringAsync(note)}
              accessibilityRole="button"
            >
              <Copy size={16} color={colors.textPrimary} />
              <Text style={styles.secondaryText}>Copy note</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable style={styles.primaryButton} onPress={onOpen} accessibilityRole="button">
          <Text style={styles.primaryText}>Open workspace</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  message: { color: colors.textSecondary, fontSize: typography.bodySize },
  noteLabel: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  note: { color: colors.textSecondary, fontSize: typography.bodySize, maxHeight: 160 },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised,
    padding: spacing.md
  },
  secondaryText: { color: colors.textPrimary, fontSize: typography.bodySize },
  primaryButton: {
    alignItems: 'center',
    borderRadius: radii.button,
    backgroundColor: colors.surfaceBright,
    padding: spacing.md
  },
  primaryText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' }
})
