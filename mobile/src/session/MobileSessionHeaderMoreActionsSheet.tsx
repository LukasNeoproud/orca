import { FileDown, ListChecks, ListTodo } from 'lucide-react-native'
import { MobileAgentSessionHistoryIcon } from '../agent-history/MobileAgentSessionHistoryIcon'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { colors } from '../theme/mobile-theme'

type Props = {
  visible: boolean
  showAgentSessionHistory: boolean
  showChecks: boolean
  showBacklog: boolean
  showApkInstall: boolean
  onOpenAgentSessionHistory: () => void
  onOpenChecks: () => void
  onOpenBacklog: () => void
  onOpenApkInstall: () => void
  onClose: () => void
}

export function MobileSessionHeaderMoreActionsSheet({
  visible,
  showAgentSessionHistory,
  showChecks,
  showBacklog,
  showApkInstall,
  onOpenAgentSessionHistory,
  onOpenChecks,
  onOpenBacklog,
  onOpenApkInstall,
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
          : []),
        ...(showApkInstall
          ? [
              {
                label: 'Install APK',
                hint: 'Choose a build from this workspace',
                icon: FileDown,
                closeBeforePress: true,
                onPress: onOpenApkInstall
              }
            ]
          : [])
      ]}
      onClose={onClose}
    />
  )
}
