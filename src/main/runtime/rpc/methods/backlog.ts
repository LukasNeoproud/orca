import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import {
  acquireBacklogBoard,
  getBacklogSnapshot,
  getBacklogTask,
  releaseBacklogBoard,
  releaseBacklogSnapshot
} from '../../../backlog-runtime/backlog-runtime-service'

const Target = z.object({
  workspaceId: z.string().min(1),
  executionHostId: z.string().min(1).optional()
})
const LeasedTarget = Target.extend({ leaseId: z.string().min(1).max(128) })

export const BACKLOG_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'backlog.snapshot',
    params: LeasedTarget,
    handler: (params, { runtime }) =>
      getBacklogSnapshot(runtime, params.workspaceId, params.leaseId, params.executionHostId)
  }),
  defineMethod({
    name: 'backlog.releaseSnapshot',
    params: LeasedTarget,
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
    params: Target.extend({ taskId: z.string().min(1).max(256) }),
    handler: (params, { runtime }) =>
      getBacklogTask(runtime, params.workspaceId, params.taskId, params.executionHostId)
  }),
  defineMethod({
    name: 'backlog.acquireBoard',
    params: LeasedTarget,
    handler: (params, { runtime }) =>
      acquireBacklogBoard(runtime, params.workspaceId, params.leaseId, params.executionHostId)
  }),
  defineMethod({
    name: 'backlog.releaseBoard',
    params: LeasedTarget,
    handler: async (params, { runtime }) => {
      await releaseBacklogBoard(runtime, params.workspaceId, params.leaseId, params.executionHostId)
      return { released: true }
    }
  })
]
