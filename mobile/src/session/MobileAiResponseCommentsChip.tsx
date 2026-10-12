import { Pressable, StyleSheet, Text } from 'react-native'
import { MessageSquareQuote } from 'lucide-react-native'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { useMobileNativeChatResponseComments } from './mobile-native-chat-response-comments-context'

// Why its own module: the composer renders this, and the comment sheets pull in animated drawers.
export function MobileAiResponseCommentsChip() {
  const responseComments = useMobileNativeChatResponseComments()
  if (!responseComments || responseComments.count === 0) {
    return null
  }
  const { count, openComments: onPress } = responseComments
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} response ${count === 1 ? 'comment' : 'comments'}`}
    >
      <MessageSquareQuote size={14} color={colors.textSecondary} />
      <Text style={styles.chipText}>{`${count} ${count === 1 ? 'comment' : 'comments'}`}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: 14,
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  chipText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '700' },
  pressed: { opacity: 0.65 }
})
