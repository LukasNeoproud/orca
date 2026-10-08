import { ipcRenderer } from 'electron'
import type {
  AzureDevOpsConnectInput,
  AzureDevOpsConnectResult,
  AzureDevOpsConnectionsStatus
} from '../../shared/azure-devops-review-types'

export type AzureDevOpsConnectionsApi = {
  status: () => Promise<AzureDevOpsConnectionsStatus>
  connect: (input: AzureDevOpsConnectInput) => Promise<AzureDevOpsConnectResult>
  disconnect: (args: { connectionId: string }) => Promise<void>
}

export const azureDevOpsConnectionsApi: AzureDevOpsConnectionsApi = {
  status: () => ipcRenderer.invoke('azureDevOps:connections:status'),
  connect: (input) => ipcRenderer.invoke('azureDevOps:connections:connect', input),
  disconnect: (args) => ipcRenderer.invoke('azureDevOps:connections:disconnect', args)
}
