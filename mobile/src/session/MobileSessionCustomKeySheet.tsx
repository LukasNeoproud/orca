import { CustomKeyModal } from '../components/CustomKeyModal'
import {
  createTerminalAccessoryLayoutPreference,
  saveTerminalAccessoryLayout
} from '../terminal/terminal-accessory-layout'
import type { MobileSessionController } from './use-mobile-session-controller'

export function MobileSessionCustomKeySheet({
  controller
}: {
  controller: MobileSessionController
}) {
  const {
    accessoryLayout,
    setAccessoryLayout,
    setCustomKeys,
    showCustomKeyModal,
    setShowCustomKeyModal,
    handleManageShortcuts
  } = controller
  return (
    <CustomKeyModal
      visible={showCustomKeyModal}
      onClose={() => setShowCustomKeyModal(false)}
      onKeysChanged={(keys) => {
        const ids = keys.map((key) => key.id)
        const next = createTerminalAccessoryLayoutPreference(accessoryLayout, undefined, ids)
        setCustomKeys(keys)
        setAccessoryLayout(next)
        void saveTerminalAccessoryLayout(next, ids)
      }}
      onManageShortcuts={handleManageShortcuts}
    />
  )
}
