import { z } from 'zod'
import { normalizeExecutionHostId, type ExecutionHostId } from './execution-host'
import type { BacklogBoardBinding } from './backlog-board-binding'
import { salvagedOptional, salvagingArray, salvagingRecord } from './zod-salvage'

export type PersistedHeadlessBacklogBoardPage = {
  browserPageId: string
  browserProfileId?: string
  backlogBoardBinding: BacklogBoardBinding
}

export const persistedHeadlessBacklogBoardPageSchema: z.ZodType<PersistedHeadlessBacklogBoardPage> =
  z.object({
    browserPageId: z.string().min(1).max(256),
    browserProfileId: z.string().min(1).max(256).optional(),
    backlogBoardBinding: z.object({
      workspaceId: z.string().min(1).max(256),
      executionHostId: z.custom<ExecutionHostId>(
        (value) => typeof value === 'string' && normalizeExecutionHostId(value) === value
      ),
      runtimeEnvironmentId: z.string().nullable()
    })
  })

export const headlessBacklogBoardSessionFields = {
  headlessBacklogBoardPagesByWorktree: salvagedOptional(
    'headlessBacklogBoardPagesByWorktree',
    salvagingRecord(z.string(), salvagingArray(persistedHeadlessBacklogBoardPageSchema))
  )
}
