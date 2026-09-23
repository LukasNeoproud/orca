import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const mobileDiffImageReviewStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.editorSurface
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgBase,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  sideSwitch: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: radii.button,
    backgroundColor: colors.bgPanel
  },
  sideButton: {
    minHeight: 36,
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.button
  },
  sideButtonActive: {
    backgroundColor: colors.bgRaised
  },
  sideButtonText: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontWeight: '700'
  },
  sideButtonTextActive: {
    color: colors.textPrimary
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    backgroundColor: colors.bgPanel
  },
  disabled: {
    opacity: 0.42
  },
  zoomText: {
    minWidth: 42,
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '700',
    textAlign: 'center'
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.editorSurface
  },
  image: {
    ...StyleSheet.absoluteFillObject
  },
  selectionLayer: {
    ...StyleSheet.absoluteFillObject
  },
  region: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.accentBlue,
    borderRadius: radii.row
  },
  staleRegion: {
    borderColor: colors.statusAmber
  },
  draftRegion: {
    borderStyle: 'dashed'
  },
  instruction: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 84,
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  actionRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  actionButtonPrimary: {
    backgroundColor: colors.textPrimary
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '700'
  },
  actionTextPrimary: {
    color: colors.bgBase
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: typography.titleSize,
    fontWeight: '700'
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.bodySize,
    lineHeight: 20,
    textAlign: 'center'
  }
})
