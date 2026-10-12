import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'

export const emulatorStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  fullscreenStatus: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '40%',
    backgroundColor: colors.bgPanel
  },
  fullscreenToggle: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: colors.bgPanel,
    borderRadius: radii.button
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  title: { flex: 1, color: colors.textPrimary, fontSize: typography.bodySize },
  button: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button
  },
  pressed: { backgroundColor: colors.bgRaised },
  disabled: { opacity: 0.45 },
  text: { color: colors.textPrimary, fontSize: typography.bodySize },
  muted: { color: colors.textSecondary, fontSize: typography.metaSize, textAlign: 'center' },
  error: { color: colors.statusRed, fontSize: typography.bodySize, textAlign: 'center' },
  screen: { flex: 1, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  status: { padding: spacing.md, alignItems: 'center', gap: spacing.sm },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.sm
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.input,
    padding: spacing.md,
    fontSize: TEXT_INPUT_FONT_SIZE,
    minHeight: 44
  }
})
