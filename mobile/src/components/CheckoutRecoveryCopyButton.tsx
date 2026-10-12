import { Copy } from 'lucide-react-native'
import { Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { useClipboardWriter } from '../platform/clipboard'
import { colors } from '../theme/mobile-theme'

export function CheckoutRecoveryCopyButton({
  value,
  label,
  style,
  textStyle
}: {
  value: string
  label: string
  style: StyleProp<ViewStyle>
  textStyle: StyleProp<TextStyle>
}) {
  const clipboard = useClipboardWriter()
  return (
    <Pressable
      style={style}
      // A refused write leaves the text on screen to select by hand.
      onPress={() => void clipboard.writeText(value).catch(() => {})}
      accessibilityRole="button"
    >
      <Copy size={16} color={colors.textPrimary} />
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  )
}
