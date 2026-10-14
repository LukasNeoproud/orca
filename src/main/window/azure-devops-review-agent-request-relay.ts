import { randomUUID } from 'node:crypto'

import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type {
  AzureDevOpsReviewAgentRendererResponse,
  AzureDevOpsReviewAgentRequest,
  AzureDevOpsReviewAgentResult
} from '../../shared/azure-devops-review-agent-request'

// Why this long: switching the review workspace may fetch the pull request's branch first.
const RENDERER_TIMEOUT_MS = 240_000

/** Asks the desktop window to run a paired client's review agent request with its own launch code. */
export async function requestAzureDevOpsReviewAgentFromRenderer(
  mainWindow: BrowserWindow,
  request: AzureDevOpsReviewAgentRequest
): Promise<AzureDevOpsReviewAgentResult> {
  if (mainWindow.isDestroyed()) {
    throw new Error('renderer_unavailable')
  }
  const webContents = mainWindow.webContents
  const id = randomUUID()
  return await new Promise((resolve, reject) => {
    let settled = false
    const onRendererUnavailable = (): void => finish(new Error('renderer_unavailable'))
    const finish = (error: Error | null, result?: AzureDevOpsReviewAgentResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      ipcMain.removeListener('azureDevOpsReview:agentResponse', onResponse)
      mainWindow.removeListener('closed', onRendererUnavailable)
      webContents.removeListener('destroyed', onRendererUnavailable)
      webContents.removeListener('render-process-gone', onRendererUnavailable)
      if (result) {
        resolve(result)
      } else {
        reject(error ?? new Error('renderer_unavailable'))
      }
    }
    const timeout = setTimeout(() => finish(new Error('renderer_timeout')), RENDERER_TIMEOUT_MS)
    const onResponse = (
      event: Electron.IpcMainEvent,
      response: AzureDevOpsReviewAgentRendererResponse
    ): void => {
      if (event.sender !== webContents || response.id !== id) {
        return
      }
      if (response.ok) {
        finish(null, response.result)
      } else {
        finish(new Error(response.error))
      }
    }
    ipcMain.on('azureDevOpsReview:agentResponse', onResponse)
    mainWindow.once('closed', onRendererUnavailable)
    webContents.once('destroyed', onRendererUnavailable)
    webContents.once('render-process-gone', onRendererUnavailable)
    try {
      webContents.send('azureDevOpsReview:agentRequest', { id, request })
    } catch {
      finish(new Error('renderer_unavailable'))
    }
  })
}
