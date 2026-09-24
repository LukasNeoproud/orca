import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

const REORDER_ROW_HEIGHT = 56

export const styles = StyleSheet.create({
  groupHeading: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs
  },
  groupTopGap: { marginTop: spacing.xl },
  groupDescription: {
    fontSize: typography.bodySize - 1,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: spacing.xs
  },
  rowCountGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  rowCountButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  rowCountSelected: { backgroundColor: colors.bgRaised, borderColor: colors.textSecondary },
  rowCountText: { color: colors.textSecondary, fontSize: typography.bodySize },
  rowCountTextSelected: { color: colors.textPrimary, fontWeight: '600' },
  section: { backgroundColor: colors.bgPanel, borderRadius: radii.card },
  sectionTopGap: { marginTop: spacing.sm },
  dragSection: { zIndex: 10, elevation: 10 },
  rowHeading: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5
  },
  emptyDropTarget: { height: REORDER_ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  },
  rowPressed: { backgroundColor: colors.bgRaised },
  reorderRowContent: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingLeft: spacing.md + 2
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: typography.bodySize, fontWeight: '500', color: colors.textPrimary },
  rowSublabel: { fontSize: typography.bodySize - 2, color: colors.textSecondary },
  keycap: {
    minWidth: 42,
    maxWidth: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.row,
    alignItems: 'center'
  },
  keycapText: { fontSize: typography.bodySize - 1, color: colors.textPrimary },
  deleteButton: { padding: spacing.sm },
  deleteButtonPressed: { backgroundColor: colors.bgRaised },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle },
  emptyText: { color: colors.textMuted, fontSize: typography.bodySize - 1 }
})
