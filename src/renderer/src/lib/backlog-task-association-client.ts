import type {
  BacklogTaskAssociation,
  BacklogTaskAssociationWrite
} from '../../../shared/backlog-task-association'
import { callBacklog, type BacklogRoute } from './backlog-rpc'

export async function listBacklogTaskAssociations(
  route: BacklogRoute
): Promise<BacklogTaskAssociation[]> {
  const result = await callBacklog<{ associations: BacklogTaskAssociation[] }>(
    route,
    'taskAssociations.list'
  )
  return result.associations
}

export async function readBacklogTaskAssociation(
  route: BacklogRoute,
  taskId: string
): Promise<BacklogTaskAssociation | null> {
  const result = await callBacklog<{ association: BacklogTaskAssociation | null }>(
    route,
    'taskAssociations.get',
    { taskId }
  )
  return result.association
}

export async function saveBacklogTaskAssociation(
  route: BacklogRoute,
  input: BacklogTaskAssociationWrite
): Promise<BacklogTaskAssociation> {
  const result = await callBacklog<{ association: BacklogTaskAssociation }>(
    route,
    'taskAssociations.upsert',
    input
  )
  return result.association
}

export async function confirmBacklogTaskAssociation(
  route: BacklogRoute,
  taskId: string,
  attemptId: string
): Promise<BacklogTaskAssociation> {
  const result = await callBacklog<{ association: BacklogTaskAssociation }>(
    route,
    'taskAssociations.confirm',
    { taskId, attemptId }
  )
  return result.association
}
