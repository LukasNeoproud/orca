import { useState } from 'react'
import { Platform } from 'react-native'
import { MobileApkBuildPicker } from '../apk/MobileApkBuildPicker'
import { MobileSessionHeaderMoreActionsSheet } from './MobileSessionHeaderMoreActionsSheet'
import type { MobileSessionController } from './use-mobile-session-controller'

export function MobileSessionHeaderSheets({ controller }: { controller: MobileSessionController }) {
  const [showApkBuildPicker, setShowApkBuildPicker] = useState(false)
  const {
    hostId,
    worktreeId,
    client,
    showHeaderMoreActions,
    setShowHeaderMoreActions,
    showAgentSessionHistoryAction,
    showBacklogAction,
    showChecksAction,
    showLoadFullTerminalHistoryAction,
    loadActiveTerminalFullHistory,
    apkInstallRouteEligible,
    openAgentSessionHistory,
    openBacklog,
    handlePanelTap
  } = controller
  const showApkInstallAction = apkInstallRouteEligible && Platform.OS === 'android'
  return (
    <>
      <MobileSessionHeaderMoreActionsSheet
        visible={showHeaderMoreActions}
        showAgentSessionHistory={showAgentSessionHistoryAction}
        showBacklog={showBacklogAction}
        showChecks={showChecksAction}
        showApkInstall={showApkInstallAction}
        showLoadFullTerminalHistory={showLoadFullTerminalHistoryAction}
        onLoadFullTerminalHistory={loadActiveTerminalFullHistory}
        onOpenAgentSessionHistory={openAgentSessionHistory}
        onOpenBacklog={openBacklog}
        onOpenChecks={() => handlePanelTap('pr')}
        onOpenApkInstall={() => setShowApkBuildPicker(true)}
        onClose={() => setShowHeaderMoreActions(false)}
      />
      <MobileApkBuildPicker
        key={`${hostId}:${worktreeId}`}
        visible={showApkBuildPicker && showApkInstallAction}
        client={client}
        worktreeId={worktreeId}
        onClose={() => setShowApkBuildPicker(false)}
      />
    </>
  )
}
