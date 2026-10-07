import { powerMonitor } from 'electron'
import { getRuntimeDesktopSurface } from '../runtime/runtime-desktop-surface'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { requestThermalEmergencySleep } from './host-thermal-sleep'
import { HostSystemWatchdog, type HostSystemAlert } from './host-system-watchdog'
import { sampleHostDisks } from './host-system-snapshot'
import {
  normalizeHostThermalState,
  readHostThermalState,
  setHostThermalStateSource,
  type HostThermalStateSource
} from './host-thermal-state'

/** Electron-host wiring: thermal state comes from powerMonitor, alerts go to desktop and phones. */
export function installHostSystemWatchdog(getRuntime: () => OrcaRuntimeService | null): () => void {
  const thermalSource: HostThermalStateSource = {
    read: () => normalizeHostThermalState(powerMonitor.getCurrentThermalState()),
    subscribe: (listener) => {
      const onChange = (details: { state: string }): void =>
        listener(normalizeHostThermalState(details.state))
      powerMonitor.on('thermal-state-change', onChange)
      return () => powerMonitor.off('thermal-state-change', onChange)
    }
  }
  setHostThermalStateSource(thermalSource)
  const notify = (alert: HostSystemAlert): void => {
    try {
      getRuntimeDesktopSurface().showNotification({ title: alert.title, body: alert.body })
    } catch {
      // Paired phones still receive the alert below.
    }
    getRuntime()?.dispatchMobileNotification({
      type: 'notification',
      source: 'host-system',
      title: alert.title,
      body: alert.body,
      notificationId: alert.id
    })
  }
  const watchdog = new HostSystemWatchdog({
    platform: process.platform,
    readThermalState: readHostThermalState,
    subscribeThermalState: thermalSource.subscribe,
    sampleDisks: () => sampleHostDisks(process.platform),
    notify,
    requestSleep: requestThermalEmergencySleep
  })
  watchdog.start()
  return () => {
    watchdog.stop()
    setHostThermalStateSource(null)
  }
}
