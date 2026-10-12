import {
  BacklogTarget,
  BacklogLeasedTarget,
  BacklogAssociationTarget,
  BacklogTaskParams,
  BacklogAssociationConfirmParams,
  BacklogAssociationUpsertParams
} from '../../../../shared/rpc-contract/backlog-params'
import { defineMethod } from '../core'
import {
  acquireBacklogBoard,
  getBacklogSnapshot,
  getBacklogTask,
  releaseBacklogBoard,
  releaseBacklogSnapshot
} from '../../../backlog-runtime/backlog-runtime-service'
import {
  confirmBacklogTaskAssociation,
  getBacklogTaskAssociation,
  listBacklogTaskAssociations,
  upsertBacklogTaskAssociation
} from '../../../backlog-runtime/backlog-task-association-service'

export const BACKLOG_METHODS = [
  defineMethod({
    name: 'backlog.taskAssociations.list',
    permission: 'workspace',
    params: BacklogTarget,
    handler: async (params, { runtime }) => ({
      associations: await listBacklogTaskAssociations(runtime, params)
    })
  }),
  defineMethod({
    name: 'backlog.snapshot',
    permission: 'workspace',
    params: BacklogLeasedTarget,
    handler: (params, { runtime }) =>
      getBacklogSnapshot(runtime, params.workspaceId, params.leaseId, params.executionHostId)
  }),
  defineMethod({
    name: 'backlog.releaseSnapshot',
    permission: 'workspace',
    params: BacklogLeasedTarget,
    handler: async (params, { runtime }) => {
      await releaseBacklogSnapshot(
        runtime,
        params.workspaceId,
        params.leaseId,
        params.executionHostId
      )
      return { released: true }
    }
  }),
  defineMethod({
    name: 'backlog.task',
    permission: 'workspace',
    params: BacklogTaskParams,
    handler: (params, { runtime }) =>
      getBacklogTask(runtime, params.workspaceId, params.taskId, params.executionHostId)
  }),
  defineMethod({
    name: 'backlog.acquireBoard',
    permission: 'workspace',
    params: BacklogLeasedTarget,
    handler: (params, { runtime }) =>
      acquireBacklogBoard(runtime, params.workspaceId, params.leaseId, params.executionHostId)
  }),
  defineMethod({
    name: 'backlog.releaseBoard',
    permission: 'workspace',
    params: BacklogLeasedTarget,
    handler: async (params, { runtime }) => {
      await releaseBacklogBoard(runtime, params.workspaceId, params.leaseId, params.executionHostId)
      return { released: true }
    }
  }),
  defineMethod({
    name: 'backlog.taskAssociations.get',
    permission: 'workspace',
    params: BacklogAssociationTarget,
    handler: async (params, { runtime }) => ({
      association: await getBacklogTaskAssociation(runtime, params)
    })
  }),
  defineMethod({
    name: 'backlog.taskAssociations.upsert',
    permission: 'workspace',
    params: BacklogAssociationUpsertParams,
    handler: async (params, { runtime }) => ({
      association: await upsertBacklogTaskAssociation(runtime, params)
    })
  }),
  defineMethod({
    name: 'backlog.taskAssociations.confirm',
    permission: 'workspace',
    params: BacklogAssociationConfirmParams,
    handler: async (params, { runtime }) => ({
      association: await confirmBacklogTaskAssociation(runtime, params)
    })
  })
]
