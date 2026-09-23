import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const mobileConversationBranchStyles = StyleSheet.create({
  sheet: { gap: spacing.md, paddingBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: typography.metaSize, lineHeight: 17 },
  label: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '700' },
  input: {
    color: colors.textPrimary,
    backgroundColor: colors.editorSurface,
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.bodySize
  },
  textArea: { minHeight: 112, textAlignVertical: 'top', fontFamily: typography.monoFamily },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  choiceSelected: { backgroundColor: colors.bgRaised, borderColor: colors.textMuted },
  choiceText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  choiceTextSelected: { color: colors.textPrimary },
  preview: {
    maxHeight: 150,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.button,
    backgroundColor: colors.editorSurface,
    padding: spacing.md
  },
  previewText: {
    color: colors.textSecondary,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize,
    lineHeight: 17
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  button: {
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  primaryButton: { backgroundColor: colors.surfaceBright },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '700' },
  primaryButtonText: { color: colors.bgBase },
  error: { color: colors.statusRed, fontSize: typography.metaSize },
  status: {
    color: colors.textSecondary,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    padding: spacing.md,
    fontSize: typography.bodySize,
    lineHeight: 20
  },
  familyCard: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md
  },
  familyMeta: { color: colors.textMuted, fontSize: typography.metaSize },
  familyHandoff: {
    color: colors.textSecondary,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize,
    lineHeight: 17
  }
})
