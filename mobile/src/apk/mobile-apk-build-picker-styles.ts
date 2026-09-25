import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const styles = StyleSheet.create({
  header: { gap: spacing.xs, paddingBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '700' },
  description: { color: colors.textSecondary, fontSize: typography.metaSize, lineHeight: 18 },
  pathSection: { gap: spacing.sm, paddingBottom: spacing.lg },
  label: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radii.input,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2
  },
  pathHint: { color: colors.textMuted, fontSize: typography.metaSize },
  controls: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  message: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    paddingVertical: spacing.sm
  },
  buildList: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.card,
    overflow: 'hidden',
    marginBottom: spacing.md
  },
  buildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: spacing.md
  },
  buildRowSelected: { backgroundColor: colors.bgRaised },
  buildText: { flex: 1, minWidth: 0, gap: spacing.xs },
  buildName: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  buildDetail: { color: colors.textMuted, fontSize: typography.metaSize },
  error: { color: colors.statusRed, fontSize: typography.metaSize, paddingBottom: spacing.sm },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  dismissButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  dismissText: { color: colors.textSecondary, fontSize: typography.bodySize },
  installButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceBright,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  installText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '700' },
  disabled: { opacity: 0.5 }
})
