import { z } from 'zod'
import { RESUMABLE_TUI_AGENTS } from '../agent-session-resume'

export const BacklogTarget = z.object({
  workspaceId: z.string().min(1),
  executionHostId: z.string().min(1).optional()
})
export const BacklogLeasedTarget = BacklogTarget.extend({ leaseId: z.string().min(1).max(128) })
export const BacklogAssociationTarget = BacklogTarget.extend({ taskId: z.string().min(1).max(256) })
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

export const BacklogTaskParams = BacklogTarget.extend({ taskId: z.string().min(1).max(256) })

export const BacklogAssociationConfirmParams = BacklogAssociationTarget.extend({
  attemptId: z.string().min(1).max(512)
})

export const BacklogAssociationUpsertParams = BacklogAssociationTarget.extend({
  targetWorkspace: AssociationWorkspace,
  session: AssociationSession,
  terminal: AssociationTerminal.optional(),
  attemptId: z.string().min(1).max(512),
  deliveryStatus: z.enum(['pending', 'confirmed', 'unverified']),
  expectedAttemptId: z.string().min(1).max(512).nullable()
})
