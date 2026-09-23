import { ListChecks, ListTodo } from 'lucide-react-native'
import { MobileAgentSessionHistoryIcon } from '../agent-history/MobileAgentSessionHistoryIcon'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { colors } from '../theme/mobile-theme'

type Props = {
  visible: boolean
  showAgentSessionHistory: boolean
  showChecks: boolean
  showBacklog: boolean
  onOpenAgentSessionHistory: () => void
  onOpenChecks: () => void
  onOpenBacklog: () => void
  onClose: () => void
}

export function MobileSessionHeaderMoreActionsSheet({
  visible,
  showAgentSessionHistory,
  showChecks,
  showBacklog,
  onOpenAgentSessionHistory,
  onOpenChecks,
  onOpenBacklog,
  onClose
}: Props) {
  return (
    <ActionSheetModal
      visible={visible}
      actions={[
        ...(showBacklog
          ? [
              {
                label: 'Backlog',
                hint: 'Browse workspace tasks',
                icon: ListTodo,
                onPress: onOpenBacklog
              }
            ]
          : []),
        ...(showAgentSessionHistory
          ? [
              {
                label: 'Agent History',
                hint: 'Browse and resume agent sessions',
                renderIcon: () => (
                  <MobileAgentSessionHistoryIcon
                    size={16}
                    color={colors.textSecondary}
                    strokeWidth={2.1}
                  />
                ),
                onPress: onOpenAgentSessionHistory
              }
            ]
          : []),
        ...(showChecks
          ? [
              {
                label: 'Checks',
                hint: 'Open pull request checks',
                icon: ListChecks,
                onPress: onOpenChecks
              }
            ]
          : [])
      ]}
      onClose={onClose}
    />
  )
}
