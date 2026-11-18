import { ipcRenderer } from 'electron'

export type ReviewRequestsApi = {
  /** Fires when the user clicks the system notification of a new review request. */
  onOpen: (callback: (data: { key: string }) => void) => () => void
}

export const reviewRequestsApi: ReviewRequestsApi = {
  onOpen: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { key: string }): void =>
      callback(data)
    ipcRenderer.on('reviewRequest:open', listener)
    return () => ipcRenderer.removeListener('reviewRequest:open', listener)
  }
}
