import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight, SquareTerminal } from 'lucide-react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

type HostIndependentTerminalsEntryProps = {
  connected: boolean
  enabled: boolean
  onPress: () => void
}

export function HostIndependentTerminalsEntry({
  connected,
  enabled,
  onPress
}: HostIndependentTerminalsEntryProps): React.JSX.Element | null {
  // Shown only with Floating Workspace on, as the desktop's header button is.
  if (!enabled) {
    return null
  }
  const available = connected
  const description = 'Terminals without a project or workspace'

  return (
    <Pressable
      style={({ pressed }) => [styles.entry, pressed && available && styles.pressed]}
      onPress={onPress}
      disabled={!available}
      accessibilityRole="button"
      accessibilityLabel="Independent terminals"
      accessibilityHint={description}
      accessibilityState={{ disabled: !available }}
    >
      <View style={styles.icon}>
        <SquareTerminal size={20} color={available ? colors.textPrimary : colors.textMuted} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, !available && styles.disabledText]}>Independent terminals</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {available ? <ChevronRight size={17} color={colors.textSecondary} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  pressed: {
    backgroundColor: colors.bgRaised
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  copy: {
    flex: 1,
    gap: spacing.xs
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  disabledText: {
    color: colors.textMuted
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.metaSize
  }
})
