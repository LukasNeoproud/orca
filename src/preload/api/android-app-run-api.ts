import { ipcRenderer } from 'electron'
import type {
  AndroidAppRunEvent,
  AndroidAppRunRequest,
  AndroidAppRunResult,
  AndroidBuildVariantsResult
} from '../../shared/android-app-run-types'

export type AndroidAppRunApi = {
  isAndroidProject: (args: { worktreePath: string }) => Promise<boolean>
  listVariants: (args: {
    worktreePath: string
    refresh?: boolean
  }) => Promise<AndroidBuildVariantsResult>
  run: (args: AndroidAppRunRequest) => Promise<AndroidAppRunResult>
  cancel: (args: { runId: string }) => Promise<void>
  /** Where the agent behind a transcript is working now, e.g. a worktree it entered. */
  agentDirectory: (args: { transcriptPath: string }) => Promise<string | null>
  onEvent: (callback: (event: AndroidAppRunEvent) => void) => () => void
}

export const androidAppRunApi: AndroidAppRunApi = {
  isAndroidProject: (args) => ipcRenderer.invoke('androidAppRun:isAndroidProject', args),
  listVariants: (args) => ipcRenderer.invoke('androidAppRun:listVariants', args),
  run: (args) => ipcRenderer.invoke('androidAppRun:run', args),
  cancel: (args) => ipcRenderer.invoke('androidAppRun:cancel', args),
  agentDirectory: (args) => ipcRenderer.invoke('androidAppRun:agentDirectory', args),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AndroidAppRunEvent): void =>
      callback(data)
    ipcRenderer.on('androidAppRun:event', listener)
    return () => ipcRenderer.removeListener('androidAppRun:event', listener)
  }
}
