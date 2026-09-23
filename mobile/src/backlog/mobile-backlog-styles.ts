import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const backlogStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.sm
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: typography.metaSize },
  connectionBanner: { backgroundColor: colors.bgRaised, padding: spacing.md },
  connectionText: { color: colors.statusAmber, fontSize: typography.metaSize, textAlign: 'center' },
  search: {
    margin: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radii.input,
    backgroundColor: colors.bgPanel,
    color: colors.textPrimary,
    fontSize: typography.bodySize
  },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  orders: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md
  },
  chip: {
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgPanel
  },
  chipSelected: { backgroundColor: colors.bgRaised, borderColor: colors.textSecondary },
  chipText: { color: colors.textSecondary, fontSize: typography.metaSize },
  chipTextSelected: { color: colors.textPrimary },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm, flexGrow: 1 },
  taskRow: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    padding: spacing.md,
    gap: spacing.sm
  },
  taskMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  taskId: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  taskStatus: { color: colors.textSecondary, fontSize: typography.metaSize },
  taskPriority: { color: colors.textMuted, fontSize: typography.metaSize },
  taskTitle: { color: colors.textPrimary, fontSize: typography.bodySize },
  center: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl
  },
  stateTitle: { color: colors.textPrimary, fontSize: typography.titleSize, textAlign: 'center' },
  muted: { color: colors.textSecondary, fontSize: typography.bodySize, textAlign: 'center' },
  retry: {
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  retryText: { color: colors.textPrimary, fontSize: typography.bodySize },
  detail: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  detailTitle: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  criteria: { gap: spacing.md },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  criterion: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkboxChecked: { backgroundColor: colors.accentBlue, borderColor: colors.accentBlue },
  criterionText: { flex: 1 },
  taskActionCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  taskActionTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  taskActionText: { color: colors.textSecondary, fontSize: typography.bodySize },
  taskActionMeta: { color: colors.textMuted, fontSize: typography.metaSize },
  taskActionWarning: { color: colors.statusAmber, fontSize: typography.metaSize },
  taskActionError: { color: colors.statusRed, fontSize: typography.metaSize },
  taskAssociationMeta: { gap: spacing.xs },
  taskActionButtons: { flexDirection: 'row', gap: spacing.sm },
  taskPrimaryButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceBright
  },
  taskPrimaryButtonText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' },
  taskSecondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgRaised
  },
  taskSecondaryButtonText: { color: colors.textPrimary, fontSize: typography.bodySize },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  launchTitle: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  launchSubtitle: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    marginBottom: spacing.md
  },
  launchLabel: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.sm
  },
  launchOptions: { gap: spacing.sm },
  launchAgentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  launchOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  launchOptionCompact: { flexGrow: 0 },
  launchOptionSelected: { borderColor: colors.textSecondary, backgroundColor: colors.bgRaised },
  launchOptionText: { color: colors.textSecondary, fontSize: typography.bodySize },
  launchOptionTextSelected: { color: colors.textPrimary, fontWeight: '600' },
  launchNotice: { color: colors.textMuted, fontSize: typography.metaSize, marginTop: spacing.md },
  launchFooter: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }
})
