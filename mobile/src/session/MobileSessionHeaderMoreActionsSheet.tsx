import { FileDown, History, ListChecks, ListTodo } from 'lucide-react-native'
import { MobileAgentSessionHistoryIcon } from '../agent-history/MobileAgentSessionHistoryIcon'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { colors } from '../theme/mobile-theme'

type Props = {
  visible: boolean
  showAgentSessionHistory: boolean
  showChecks: boolean
  showBacklog: boolean
  showApkInstall: boolean
  showLoadFullTerminalHistory: boolean
  onOpenAgentSessionHistory: () => void
  onOpenChecks: () => void
  onOpenBacklog: () => void
  onOpenApkInstall: () => void
  onLoadFullTerminalHistory: () => void
  onClose: () => void
}

export function MobileSessionHeaderMoreActionsSheet({
  visible,
  showAgentSessionHistory,
  showChecks,
  showBacklog,
  showApkInstall,
  showLoadFullTerminalHistory,
  onOpenAgentSessionHistory,
  onOpenChecks,
  onOpenBacklog,
  onOpenApkInstall,
  onLoadFullTerminalHistory,
  onClose
}: Props) {
  return (
    <ActionSheetModal
      visible={visible}
      actions={[
        ...(showLoadFullTerminalHistory
          ? [
              {
                label: 'Load Full History',
                hint: 'Older terminal output was skipped on this slow connection',
                icon: History,
                closeBeforePress: true,
                onPress: onLoadFullTerminalHistory
              }
            ]
          : []),
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
