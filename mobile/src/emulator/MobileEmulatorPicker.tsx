import { useEffect, useState } from 'react'
import { RefreshCw, Smartphone } from 'lucide-react-native'
import { ActionSheetModal, type ActionSheetAction } from '../components/ActionSheetModal'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileEmulatorDevice } from './mobile-emulator-types'

type DeviceListResult = { devices: MobileEmulatorDevice[] }

export function MobileEmulatorPicker(props: {
  visible: boolean
  client: RpcClient | null
  supported: boolean | null
  onSelect: (device: MobileEmulatorDevice) => void
  onClose: () => void
}) {
  const { visible, client, supported, onSelect, onClose } = props
  const [devices, setDevices] = useState<MobileEmulatorDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!visible || !client || supported !== true) {
      setDevices([])
      return
    }
    let cancelled = false
    setDevices([])
    setLoading(true)
    setError(null)
    void client
      .sendRequest('emulator.mobile.devices', {}, { timeoutMs: 20_000 })
      .then((response) => {
        if (cancelled) {
          return
        }
        if (!response.ok) {
          setError(response.error.message || 'Could not load devices')
          return
        }
        const result = response.result as DeviceListResult
        setDevices(
          Array.isArray(result?.devices) ? result.devices.filter((d) => d.isAvailable) : []
        )
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Could not load devices')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [visible, client, supported, refresh])

  let message: string | undefined
  if (!client) {
    message = 'Connect to the paired Orca host to see its devices.'
  } else if (supported === false) {
    message = 'Use an up-to-date desktop Orca host with Mobile Emulator enabled in settings.'
  } else if (supported === null) {
    message = 'Checking desktop support…'
  } else if (loading) {
    message = 'Looking for existing devices…'
  } else if (error) {
    message = error
  } else if (devices.length === 0) {
    message = 'No existing devices found on the paired Orca host. Configure one there first.'
  }

  const actions: ActionSheetAction[] =
    supported === true && client
      ? [
          ...devices.map((device) => ({
            label: device.name,
            hint: `${device.backend === 'ios' ? 'iOS' : 'Android'} · ${device.state === 'booted' ? 'Running' : device.state === 'booting' ? 'Starting' : 'Shut down'}${device.detail ? ` · ${device.detail}` : ''}`,
            icon: Smartphone,
            onPress: () => onSelect(device)
          })),
          {
            label: 'Refresh devices',
            icon: RefreshCw,
            loading,
            onPress: () => setRefresh((value) => value + 1),
            skipAutoClose: true
          }
        ]
      : []

  return (
    <ActionSheetModal
      visible={visible}
      title="Mobile Emulator"
      message={message}
      actions={actions}
      onClose={onClose}
    />
  )
}
