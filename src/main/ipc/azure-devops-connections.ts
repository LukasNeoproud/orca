import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { Store } from '../persistence'
import type { AzureDevOpsConnectInput } from '../../shared/azure-devops-review-types'
import {
  connectAzureDevOps,
  disconnectAzureDevOps,
  getAzureDevOpsConnectionsStatus
} from '../azure-devops/azure-devops-connection-service'

// Why window-only: tokens are typed into local Settings, never sent by paired clients.
function requireLocalWindow(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed() || event.sender.getType() !== 'window') {
    throw new Error('Azure DevOps connections are managed from local Orca Desktop')
  }
}

export function registerAzureDevOpsConnectionHandlers(store: Store): void {
  ipcMain.handle('azureDevOps:connections:status', (event) => {
    requireLocalWindow(event)
    return getAzureDevOpsConnectionsStatus(store.getRepos())
  })
  ipcMain.handle('azureDevOps:connections:connect', (event, input: AzureDevOpsConnectInput) => {
    requireLocalWindow(event)
    return connectAzureDevOps(input)
  })
  ipcMain.handle('azureDevOps:connections:disconnect', (event, args: { connectionId: string }) => {
    requireLocalWindow(event)
    disconnectAzureDevOps(args.connectionId)
  })
}
