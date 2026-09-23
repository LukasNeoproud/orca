import { StyleSheet, Text } from 'react-native'
import type { NativeChatGeneration } from '../../../src/shared/native-chat-generation'
import { colors, typography } from '../theme/mobile-theme'
import { mobileGenerationLabel } from './mobile-native-chat-generation-label'

export function MobileNativeChatGenerationStats({
  generation
}: {
  generation?: NativeChatGeneration
}): React.JSX.Element | null {
  if (!generation) {
    return null
  }
  const label = mobileGenerationLabel(generation)
  return label ? (
    <Text style={styles.label} accessibilityLabel={label}>
      {label}
    </Text>
  ) : null
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize,
    fontVariant: ['tabular-nums']
  }
})
