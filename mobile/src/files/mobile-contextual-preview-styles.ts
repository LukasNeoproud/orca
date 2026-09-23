import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const contextualPreviewStyles = StyleSheet.create({
  sheetHeader: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  sheetPath: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize
  },
  card: {
    marginBottom: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.editorSurface,
    overflow: 'hidden'
  },
  header: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button
  },
  iconButtonPressed: {
    backgroundColor: colors.bgRaised,
    transform: [{ scale: 0.96 }]
  },
  body: {
    height: 220,
    backgroundColor: colors.editorSurface
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.bodySize,
    lineHeight: 20,
    textAlign: 'center'
  },
  stateButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  stateButtonPressed: {
    backgroundColor: colors.bgRaised,
    transform: [{ scale: 0.96 }]
  },
  stateButtonText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  markdownScroll: {
    flex: 1
  },
  markdownContent: {
    padding: spacing.md
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.bodySize
  },
  imageFrame: {
    flex: 1,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.editorSurface
  },
  footer: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 11
  },
  footerTextChanged: {
    color: colors.statusAmber
  },
  htmlContainer: {
    flex: 1
  },
  htmlToolbar: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  htmlModeButton: {
    minHeight: 32,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radii.button
  },
  htmlModeButtonActive: {
    backgroundColor: colors.bgRaised
  },
  htmlModeButtonText: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  htmlModeButtonTextActive: {
    color: colors.textPrimary
  },
  htmlWebView: {
    flex: 1,
    backgroundColor: colors.surfaceBright
  }
})
