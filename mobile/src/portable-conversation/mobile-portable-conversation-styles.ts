import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const portableStyles = StyleSheet.create({
  sheet: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.xs },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  description: { color: colors.textSecondary, fontSize: typography.metaSize },
  evidence: {
    padding: spacing.sm,
    gap: 2,
    borderRadius: radii.input,
    backgroundColor: colors.bgPanel
  },
  evidenceText: { color: colors.textSecondary, fontSize: typography.metaSize },
  mono: {
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  message: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel
  },
  messageRole: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  messageText: { color: colors.textSecondary, fontSize: typography.bodySize },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
  button: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  buttonPressed: { opacity: 0.78 },
  buttonDisabled: { opacity: 0.45 },
  primaryButton: { backgroundColor: colors.surfaceBright },
  buttonText: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  primaryButtonText: { color: colors.bgBase },
  field: { gap: spacing.xs },
  label: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  input: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.input,
    backgroundColor: colors.bgPanel,
    color: colors.textPrimary,
    fontSize: typography.bodySize
  },
  contextInput: {
    minHeight: 220,
    textAlignVertical: 'top',
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize
  },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.bgPanel
  },
  choiceActive: { backgroundColor: colors.bgRaised },
  choiceText: { color: colors.textSecondary, fontSize: typography.metaSize },
  choiceTextActive: { color: colors.textPrimary, fontWeight: '600' },
  workspace: {
    padding: spacing.sm,
    gap: 2,
    borderRadius: radii.button,
    backgroundColor: colors.bgPanel
  },
  workspaceActive: { backgroundColor: colors.bgRaised },
  workspaceTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  status: {
    padding: spacing.sm,
    borderRadius: radii.input,
    backgroundColor: colors.bgPanel
  },
  statusText: { color: colors.statusAmber, fontSize: typography.metaSize },
  errorText: { color: colors.statusRed, fontSize: typography.metaSize },
  loading: { paddingVertical: spacing.lg }
})
