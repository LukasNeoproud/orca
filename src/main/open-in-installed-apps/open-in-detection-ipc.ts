import { ipcMain } from 'electron'
import { detectInstalledOpenInApplications } from './detect-installed-open-in-applications'

export function registerOpenInDetectionHandlers(): void {
  ipcMain.handle('shell:detectOpenInApplications', () => detectInstalledOpenInApplications())
}
