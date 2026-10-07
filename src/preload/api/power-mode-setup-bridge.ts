import { ipcRenderer } from 'electron'
import type {
  PowerModeSetupActionResult,
  PowerModeSetupStatus
} from '../../shared/host-system-types'

export type PowerModeSetupApi = {
  getStatus: () => Promise<PowerModeSetupStatus>
  install: () => Promise<PowerModeSetupActionResult>
  remove: () => Promise<PowerModeSetupActionResult>
}

export const powerModeSetupApi: PowerModeSetupApi = {
  getStatus: () => ipcRenderer.invoke('powerModeSetup:getStatus'),
  install: () => ipcRenderer.invoke('powerModeSetup:install'),
  remove: () => ipcRenderer.invoke('powerModeSetup:remove')
}
