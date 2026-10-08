import { omitPairingLocalUiFields } from '../../../../shared/pairing-local-ui-fields'
import type { PersistedUIState } from '../../../../shared/persisted-ui-state-types'

export function getPairingSafeUiUpdates(
  updates: Partial<PersistedUIState>
): ReturnType<typeof omitPairingLocalUiFields> {
  const paired = omitPairingLocalUiFields(updates)
  // Why: a new web renderer can reconnect to an older host whose strict schema
  // does not know the desktop-only manager view or the pull requests tab.
  const view =
    paired.activeView === 'agent-manager' ? { ...paired, activeView: 'terminal' as const } : paired
  if (view.rightSidebarTab !== 'pull-requests') {
    return view
  }
  const { rightSidebarTab: _desktopOnlyTab, ...rest } = view
  return rest
}
