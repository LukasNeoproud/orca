import { z } from 'zod'
import {
  CONVERSATION_BRANCH_FOCUS_MAX,
  CONVERSATION_BRANCH_LABEL_MAX,
  CONVERSATION_BRANCH_MODES,
  CONVERSATION_BRANCH_RETURN_MAX,
  CONVERSATION_BRANCH_SURFACES
} from '../conversation-branch'

const Key = z.string().min(1).max(4096)

const Source = z.discriminatedUnion('kind', [
  // A chat's row: the host maps it to the turn it belongs to.
  z.object({ kind: z.literal('chat'), sessionId: Key, itemId: Key }).strict(),
  // A terminal conversation's turn, as `conversationBranch.outline` listed it.
  z.object({ kind: z.literal('transcript'), providerSessionId: Key, promptUuid: Key }).strict()
])

export const ConversationBranchPrepareParams = z
  .object({
    requestId: Key,
    worktreeId: Key,
    source: Source,
    mode: z.enum(CONVERSATION_BRANCH_MODES),
    surface: z.enum(CONVERSATION_BRANCH_SURFACES),
    label: z.string().trim().min(1).max(CONVERSATION_BRANCH_LABEL_MAX),
    focus: z.string().trim().max(CONVERSATION_BRANCH_FOCUS_MAX).optional(),
    batchId: Key.optional(),
    /** A clean chat the client already created; its Claude id is derived on the host. */
    childStructuredSessionId: Key.optional()
  })
  .strict()

export const ConversationBranchListParams = z.object({ worktreeId: Key }).strict()

export const ConversationBranchOutlineParams = z
  .object({ worktreeId: Key, providerSessionId: Key })
  .strict()

export const ConversationBranchRecordReturnParams = z
  .object({
    branchId: Key,
    returnId: Key,
    content: z.string().trim().min(1).max(CONVERSATION_BRANCH_RETURN_MAX)
  })
  .strict()
