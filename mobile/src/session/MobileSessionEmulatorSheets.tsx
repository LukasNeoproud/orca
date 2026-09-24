import { ActionSheetModal } from '../components/ActionSheetModal'
import { MobileEmulatorPicker } from '../emulator/MobileEmulatorPicker'
import type { MobileSessionController } from './use-mobile-session-controller'

export function MobileSessionEmulatorSheets({
  controller
}: {
  controller: MobileSessionController
}) {
  const {
    client,
    showEmulatorPicker,
    setShowEmulatorPicker,
    emulatorStreamSupported,
    emulatorActionTarget,
    setEmulatorActionTarget,
    openEmulatorDevice,
    closeEmulatorTab
  } = controller
  return (
    <>
      <MobileEmulatorPicker
        visible={showEmulatorPicker}
        client={client}
        supported={emulatorStreamSupported}
        onSelect={(device) => {
          setShowEmulatorPicker(false)
          openEmulatorDevice(device)
        }}
        onClose={() => setShowEmulatorPicker(false)}
      />
      <ActionSheetModal
        visible={emulatorActionTarget !== null}
        title={emulatorActionTarget?.title ?? 'Mobile Emulator'}
        actions={[
          {
            label: 'Close Tab',
            destructive: true,
            onPress: () => {
              if (emulatorActionTarget) {
                closeEmulatorTab(emulatorActionTarget)
              }
            }
          }
        ]}
        onClose={() => setEmulatorActionTarget(null)}
      />
    </>
  )
}
