import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
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
import { RESUMABLE_TUI_AGENTS } from '../../../../shared/agent-session-resume'

const Target = z.object({
  workspaceId: z.string().min(1),
  executionHostId: z.string().min(1).optional()
})
const LeasedTarget = Target.extend({ leaseId: z.string().min(1).max(128) })
const AssociationTarget = Target.extend({ taskId: z.string().min(1).max(256) })
const AssociationWorkspace = z.object({
  workspaceId: z.string().min(1).max(512),
  kind: z.enum(['git-worktree', 'folder'])
})
const ProviderSession = z.object({
  key: z.enum(['session_id', 'conversation_id']),
  id: z.string().min(1).max(512),
  transcriptPath: z.string().min(1).max(4096).optional()
})
const AssociationSession = z.object({
  title: z.string().min(1).max(512).optional(),
  agent: z.string().min(1).max(512).optional(),
  structuredSessionId: z.string().min(1).max(512).optional(),
  providerSession: ProviderSession.optional(),
  history: z
    .object({
      filePath: z.string().min(1).max(4096),
      codexHome: z.string().min(1).max(4096).optional(),
      cwd: z.string().min(1).max(4096).optional()
    })
    .optional()
})
const AssociationTerminal = z.object({
  tabId: z.string().min(1).max(512),
  leafId: z.string().min(1).max(512).optional(),
  paneKey: z.string().min(1).max(512).optional(),
  ptyId: z.string().min(1).max(512).optional(),
  launchAgent: z.enum(RESUMABLE_TUI_AGENTS).optional()
})

export const BACKLOG_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'backlog.taskAssociations.list',
    params: Target,
    handler: async (params, { runtime }) => ({
      associations: await listBacklogTaskAssociations(runtime, params)
    })
  }),
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
  }),
  defineMethod({
    name: 'backlog.taskAssociations.get',
    params: AssociationTarget,
    handler: async (params, { runtime }) => ({
      association: await getBacklogTaskAssociation(runtime, params)
    })
  }),
  defineMethod({
    name: 'backlog.taskAssociations.upsert',
    params: AssociationTarget.extend({
      targetWorkspace: AssociationWorkspace,
      session: AssociationSession,
      terminal: AssociationTerminal.optional(),
      attemptId: z.string().min(1).max(512),
      deliveryStatus: z.enum(['pending', 'confirmed', 'unverified']),
      expectedAttemptId: z.string().min(1).max(512).nullable()
    }),
    handler: async (params, { runtime }) => ({
      association: await upsertBacklogTaskAssociation(runtime, params)
    })
  }),
  defineMethod({
    name: 'backlog.taskAssociations.confirm',
    params: AssociationTarget.extend({ attemptId: z.string().min(1).max(512) }),
    handler: async (params, { runtime }) => ({
      association: await confirmBacklogTaskAssociation(runtime, params)
    })
  })
]
