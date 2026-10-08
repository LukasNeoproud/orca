import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const reviewStyles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel
  },
  cardDashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderSubtle },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  location: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  meta: { color: colors.textSecondary, fontSize: typography.metaSize },
  muted: { color: colors.textMuted, fontSize: typography.metaSize },
  body: { color: colors.textPrimary, fontSize: typography.bodySize },
  error: { color: colors.statusRed, fontSize: typography.metaSize },
  success: { color: colors.statusGreen, fontSize: typography.metaSize },
  input: {
    minHeight: 96,
    padding: spacing.sm,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgBase,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    textAlignVertical: 'top'
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  buttonPrimary: { backgroundColor: colors.accentBlue, borderColor: colors.accentBlue },
  buttonText: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '500' },
  buttonPrimaryText: { color: colors.onAccent, fontSize: typography.metaSize, fontWeight: '600' },
  disabled: { opacity: 0.5 }
})
