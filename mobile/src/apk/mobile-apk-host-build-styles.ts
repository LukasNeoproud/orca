import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const styles = StyleSheet.create({
  section: { gap: spacing.sm, paddingBottom: spacing.lg },
  label: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  variants: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  variant: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  variantSelected: { backgroundColor: colors.bgRaised, borderColor: colors.textSecondary },
  variantText: { color: colors.textSecondary, fontSize: typography.metaSize },
  variantTextSelected: { color: colors.textPrimary, fontWeight: '600' },
  abiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  abiText: { flex: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  error: { color: colors.statusRed, fontSize: typography.metaSize },
  buildButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  buildButtonText: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  disabled: { opacity: 0.5 }
})
