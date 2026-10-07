import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  getPowerModeSetupStatus,
  installPowerModeSetup,
  removePowerModeSetup
} from '../host-system/power-mode-sudoers-setup'

// Why window-only: the install raises a root authorization dialog, which must never be
// reachable from a web client or a paired phone driving this host remotely.
function requireLocalWindow(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed() || event.sender.getType() !== 'window') {
    throw new Error('Power mode setup requires local Orca Desktop')
  }
}

export function registerPowerModeSetupHandlers(): void {
  ipcMain.handle('powerModeSetup:getStatus', (event) => {
    requireLocalWindow(event)
    return getPowerModeSetupStatus()
  })
  ipcMain.handle('powerModeSetup:install', (event) => {
    requireLocalWindow(event)
    return installPowerModeSetup()
  })
  ipcMain.handle('powerModeSetup:remove', (event) => {
    requireLocalWindow(event)
    return removePowerModeSetup()
  })
}
