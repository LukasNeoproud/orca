import { useState } from 'react'
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
    showApkInstallAction,
    openAgentSessionHistory,
    openBacklog,
    handlePanelTap
  } = controller
  return (
    <>
      <MobileSessionHeaderMoreActionsSheet
        visible={showHeaderMoreActions}
        showAgentSessionHistory={showAgentSessionHistoryAction}
        showBacklog={showBacklogAction}
        showChecks={showChecksAction}
        showApkInstall={showApkInstallAction}
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
