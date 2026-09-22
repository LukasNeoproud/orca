import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type {
  BacklogTaskAssociation,
  BacklogTaskAssociationConfirmParams,
  BacklogTaskAssociationGetParams,
  BacklogTaskAssociationUpsertParams,
  BacklogTaskAssociationWorkspace
} from '../../shared/backlog-task-association'
import { normalizeBacklogTaskAssociations } from '../../shared/backlog-task-association'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { ExecutionHostId } from '../../shared/execution-host'
import { getProjectIdentityKey } from '../../shared/project-host-setup-projection'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { getRepoIdFromWorktreeId } from '../../shared/worktree/id'
import { resolveBacklogTarget } from './backlog-target'

type AssociationScope = {
  projectId: string
  executionHostId: ExecutionHostId
  workspace: BacklogTaskAssociationWorkspace
}

function associationKey(
  scope: Pick<AssociationScope, 'projectId' | 'executionHostId'>,
  taskId: string
) {
  return [scope.projectId, scope.executionHostId, taskId].join('\0')
}

async function resolveAssociationScope(
  runtime: OrcaRuntimeService,
  workspaceId: string,
  expectedExecutionHostId?: string
): Promise<AssociationScope> {
  const resolved = await resolveBacklogTarget(runtime, workspaceId, expectedExecutionHostId)
  const folder = parseWorkspaceKey(resolved.workspaceId)
  if (folder?.type === 'folder') {
    if (!runtime.listFolderWorkspaces().some((entry) => entry.id === folder.folderWorkspaceId)) {
      throw new Error('backlog_task_association_workspace_not_found')
    }
    return {
      projectId: resolved.workspaceId,
      executionHostId: resolved.executionHostId as ExecutionHostId,
      workspace: { workspaceId: resolved.workspaceId, kind: 'folder' }
    }
  }

  const repoId = getRepoIdFromWorktreeId(resolved.workspaceId)
  const repo = runtime
    .listRepos()
    .find(
      (candidate) =>
        candidate.id === repoId && getRepoExecutionHostId(candidate) === resolved.executionHostId
    )
  if (!repo) {
    throw new Error('backlog_task_association_project_not_found')
  }
  return {
    projectId: getProjectIdentityKey(repo),
    executionHostId: resolved.executionHostId as ExecutionHostId,
    workspace: { workspaceId: resolved.workspaceId, kind: 'git-worktree' }
  }
}

function findAssociation(
  associations: readonly BacklogTaskAssociation[],
  scope: AssociationScope,
  taskId: string
): BacklogTaskAssociation | null {
  const key = associationKey(scope, taskId)
  return (
    associations.find((association) => associationKey(association, association.taskId) === key) ??
    null
  )
}

export async function getBacklogTaskAssociation(
  runtime: OrcaRuntimeService,
  params: BacklogTaskAssociationGetParams
): Promise<BacklogTaskAssociation | null> {
  const scope = await resolveAssociationScope(runtime, params.workspaceId, params.executionHostId)
  return findAssociation(runtime.getBacklogTaskAssociations(), scope, params.taskId)
}

export async function listBacklogTaskAssociations(
  runtime: OrcaRuntimeService,
  params: Omit<BacklogTaskAssociationGetParams, 'taskId'>
): Promise<BacklogTaskAssociation[]> {
  const scope = await resolveAssociationScope(runtime, params.workspaceId, params.executionHostId)
  return runtime
    .getBacklogTaskAssociations()
    .filter(
      (entry) =>
        entry.projectId === scope.projectId && entry.executionHostId === scope.executionHostId
    )
}

export async function upsertBacklogTaskAssociation(
  runtime: OrcaRuntimeService,
  params: BacklogTaskAssociationUpsertParams
): Promise<BacklogTaskAssociation> {
  const source = await resolveAssociationScope(runtime, params.workspaceId, params.executionHostId)
  const target = await resolveAssociationScope(
    runtime,
    params.targetWorkspace.workspaceId,
    source.executionHostId
  )
  if (
    target.projectId !== source.projectId ||
    target.executionHostId !== source.executionHostId ||
    target.workspace.kind !== params.targetWorkspace.kind
  ) {
    throw new Error('backlog_task_association_target_mismatch')
  }

  const associations = runtime.getBacklogTaskAssociations()
  const previous = findAssociation(associations, source, params.taskId)
  if ((previous?.attemptId ?? null) !== params.expectedAttemptId) {
    throw new Error('backlog_task_association_attempt_conflict')
  }
  if (
    previous?.attemptId === params.attemptId &&
    previous.deliveryStatus === 'confirmed' &&
    params.deliveryStatus !== 'confirmed'
  ) {
    throw new Error('backlog_task_association_delivery_conflict')
  }

  const now = Date.now()
  const candidate: BacklogTaskAssociation = {
    projectId: source.projectId,
    executionHostId: source.executionHostId,
    taskId: params.taskId,
    sourceWorkspace: source.workspace,
    targetWorkspace: target.workspace,
    session: structuredClone(params.session),
    ...(params.terminal ? { terminal: structuredClone(params.terminal) } : {}),
    attemptId: params.attemptId,
    deliveryStatus: params.deliveryStatus,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  }
  const association = normalizeBacklogTaskAssociations([candidate])[0]
  if (!association) {
    throw new Error('backlog_task_association_invalid')
  }
  const previousKey = associationKey(source, params.taskId)
  runtime.persistBacklogTaskAssociations([
    ...associations.filter(
      (candidate) => associationKey(candidate, candidate.taskId) !== previousKey
    ),
    association
  ])
  return association
}

export async function confirmBacklogTaskAssociation(
  runtime: OrcaRuntimeService,
  params: BacklogTaskAssociationConfirmParams
): Promise<BacklogTaskAssociation> {
  const scope = await resolveAssociationScope(runtime, params.workspaceId, params.executionHostId)
  const associations = runtime.getBacklogTaskAssociations()
  const previous = findAssociation(associations, scope, params.taskId)
  if (!previous) {
    throw new Error('backlog_task_association_not_found')
  }
  if (previous.attemptId !== params.attemptId) {
    throw new Error('backlog_task_association_attempt_conflict')
  }
  const association = { ...previous, deliveryStatus: 'confirmed' as const, updatedAt: Date.now() }
  const key = associationKey(scope, params.taskId)
  runtime.persistBacklogTaskAssociations(
    associations.map((candidate) =>
      associationKey(candidate, candidate.taskId) === key ? association : candidate
    )
  )
  return association
}
