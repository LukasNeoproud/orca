import { z } from 'zod'
import { OptionalString } from '../schemas'
import { BrowserPageCreationPlacement } from '../../../../shared/browser-client-host-placement'
import { RUNTIME_NAVIGATION_TARGETS } from '../../../../shared/runtime-navigation'
import { normalizeExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'

export const BrowserTabCreateParams = z.object({
  url: OptionalString,
  worktree: OptionalString,
  page: OptionalString,
  profileId: OptionalString,
  waitForRegistration: z.boolean().optional(),
  activate: z.boolean().optional(),
  // Why: `activate` says the caller wants the new tab selected; `navigation` says on whose screens.
  // Absent, a paired caller means 'caller' — one device's create must not steer every other UI.
  navigation: z.enum(RUNTIME_NAVIGATION_TARGETS).optional(),
  targetGroupId: OptionalString,
  backlogBoardBinding: z
    .object({
      workspaceId: z.string().min(1),
      executionHostId: z.custom<ExecutionHostId>(
        (value) => typeof value === 'string' && normalizeExecutionHostId(value) === value
      ),
      runtimeEnvironmentId: z.string().nullable()
    })
    .optional(),
  placement: BrowserPageCreationPlacement.optional()
})

export const BrowserOpenUrlParams = z.object({
  url: z.url(),
  worktree: z.string().min(1)
})
