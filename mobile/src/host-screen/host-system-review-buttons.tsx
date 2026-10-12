import { Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { Activity, GitPullRequest } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'

/** Host-wide System and Pull requests entry points shown in both host toolbars. */
export function HostSystemReviewButtons({
  hostId,
  connected,
  navigate,
  buttonStyle,
  disabledStyle
}: {
  hostId: string
  connected: boolean
  navigate: (path: string) => void
  buttonStyle: StyleProp<ViewStyle>
  disabledStyle?: StyleProp<ViewStyle>
}): React.JSX.Element {
  return (
    <>
      {/* Stays enabled offline: the screen shows the host's last known state. */}
      <Pressable
        style={buttonStyle}
        onPress={() => navigate(`/h/${hostId}/system`)}
        accessibilityRole="button"
        accessibilityLabel="System"
      >
        <Activity size={16} color={colors.textSecondary} />
      </Pressable>
      <Pressable
        style={[buttonStyle, !connected && disabledStyle]}
        onPress={() => navigate(`/h/${hostId}/pull-requests`)}
        disabled={!connected}
        accessibilityRole="button"
        accessibilityLabel="Pull requests"
      >
        <GitPullRequest size={16} color={connected ? colors.textSecondary : colors.textMuted} />
      </Pressable>
    </>
  )
}
