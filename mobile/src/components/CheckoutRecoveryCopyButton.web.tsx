import type { StyleProp, TextStyle, ViewStyle } from 'react-native'

/** Host pages carry no clipboard grant; the recovered text above stays selectable instead. */
export function CheckoutRecoveryCopyButton(_props: {
  value: string
  label: string
  style: StyleProp<ViewStyle>
  textStyle: StyleProp<TextStyle>
}): null {
  return null
}
