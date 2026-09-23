import type {
  BacklogTaskAssociation,
  BacklogTaskAssociationWrite
} from '../../../src/shared/backlog-task-association'
import { normalizeBacklogTaskAssociations } from '../../../src/shared/backlog-task-association'
import type { RpcClient } from '../transport/rpc-client'

type BacklogClient = Pick<RpcClient, 'sendRequest'>

export async function readMobileBacklogTaskAssociation(
  client: BacklogClient,
  workspaceId: string,
  taskId: string
): Promise<BacklogTaskAssociation | null> {
  const response = await client.sendRequest(
    'backlog.taskAssociations.get',
    { workspaceId, taskId },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to load the linked conversation.')
  }
  const raw = (response.result as { association?: unknown } | null)?.association
  if (raw === null || raw === undefined) {
    return null
  }
  return normalizeBacklogTaskAssociations([raw])[0] ?? null
}

export async function saveMobileBacklogTaskAssociation(
  client: BacklogClient,
  sourceWorkspaceId: string,
  write: BacklogTaskAssociationWrite
): Promise<BacklogTaskAssociation> {
  const response = await client.sendRequest(
    'backlog.taskAssociations.upsert',
    { workspaceId: sourceWorkspaceId, ...write },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to save the linked conversation.')
  }
  const raw = (response.result as { association?: unknown } | null)?.association
  const association = normalizeBacklogTaskAssociations([raw])[0]
  if (!association) {
    throw new Error('The host returned an invalid task association.')
  }
  return association
}

export async function confirmMobileBacklogTaskAssociation(
  client: BacklogClient,
  sourceWorkspaceId: string,
  taskId: string,
  attemptId: string
): Promise<BacklogTaskAssociation> {
  const response = await client.sendRequest(
    'backlog.taskAssociations.confirm',
    { workspaceId: sourceWorkspaceId, taskId, attemptId },
    { timeoutMs: 15_000, budgetSpansConnect: true }
  )
  if (!response.ok) {
    throw new Error(response.error?.message || 'Unable to confirm task delivery.')
  }
  const raw = (response.result as { association?: unknown } | null)?.association
  const association = normalizeBacklogTaskAssociations([raw])[0]
  if (!association) {
    throw new Error('The host returned an invalid task association.')
  }
  return association
}
