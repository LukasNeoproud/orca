// A related Claude conversation forked from a completed turn of another one. Keyed by the
// child's provider session id, so a branch keeps its lineage whether it runs in a chat or a
// terminal, and across moving between them. Pure data: the phone imports it too.

import { z } from 'zod'

export const CONVERSATION_BRANCH_MODES = ['full', 'compact', 'clean'] as const
export type ConversationBranchMode = (typeof CONVERSATION_BRANCH_MODES)[number]

export function isConversationBranchMode(value: string): value is ConversationBranchMode {
  return CONVERSATION_BRANCH_MODES.some((mode) => mode === value)
}

export const CONVERSATION_BRANCH_SURFACES = ['chat', 'terminal'] as const
export type ConversationBranchSurface = (typeof CONVERSATION_BRANCH_SURFACES)[number]

export const CONVERSATION_BRANCH_STATES = [
  'forking',
  // The provider may or may not have written the child; never forked again automatically.
  'fork-unverified',
  'prepared',
  'failed'
] as const
export type ConversationBranchState = (typeof CONVERSATION_BRANCH_STATES)[number]

export const CONVERSATION_BRANCH_LABEL_MAX = 200
export const CONVERSATION_BRANCH_FOCUS_MAX = 2_000
export const CONVERSATION_BRANCH_EXCERPT_MAX = 400
export const CONVERSATION_BRANCH_RETURN_MAX = 200_000

const Key = z.string().min(1).max(4096)

export const ConversationBranchReturnSchema = z.object({
  returnId: Key,
  content: z.string().min(1).max(CONVERSATION_BRANCH_RETURN_MAX),
  createdAt: z.number().finite()
})
export type ConversationBranchReturn = z.infer<typeof ConversationBranchReturnSchema>

export const ConversationBranchRecordSchema = z.object({
  schemaVersion: z.literal(1),
  branchId: Key,
  requestId: Key,
  workspaceId: Key,
  executionHostId: Key,
  agent: z.literal('claude'),
  parent: z.object({
    providerSessionId: Key,
    /** The chat the branch was made from, when it was one. */
    structuredSessionId: Key.optional(),
    /** The chat's journal item that opened the forked turn, for jumping back to it. */
    turnItemId: Key.optional(),
    /** The chat's reply the branch was made from, where its fork point is marked. */
    replyItemId: Key.optional(),
    /** The prompt that opened the forked turn, in the parent's transcript. */
    promptUuid: Key,
    /** The turn's last main-chain entry: the child holds history up to and including it. */
    boundaryUuid: Key,
    excerpt: z.string().max(CONVERSATION_BRANCH_EXCERPT_MAX)
  }),
  child: z.object({
    /** Null until a clean chat is created, or while a fork has not proven its id. */
    providerSessionId: Key.nullable(),
    surface: z.enum(CONVERSATION_BRANCH_SURFACES)
  }),
  mode: z.enum(CONVERSATION_BRANCH_MODES),
  label: z.string().min(1).max(CONVERSATION_BRANCH_LABEL_MAX),
  focus: z.string().max(CONVERSATION_BRANCH_FOCUS_MAX).optional(),
  /** Branches confirmed together, e.g. one per review finding. */
  batchId: Key.optional(),
  state: z.enum(CONVERSATION_BRANCH_STATES),
  error: z.string().max(512).optional(),
  returns: z.array(ConversationBranchReturnSchema).max(100),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite()
})
export type ConversationBranchRecord = z.infer<typeof ConversationBranchRecordSchema>

export function isConversationBranchRecord(value: unknown): value is ConversationBranchRecord {
  return ConversationBranchRecordSchema.safeParse(value).success
}

/** One completed turn a branch can start after. */
export type ConversationBranchTurn = {
  promptUuid: string
  prompt: string
  reply: string
}

export type ConversationBranchOutline = {
  turns: ConversationBranchTurn[]
  /** The newest reply whole (up to the return limit): what a branch hands back. */
  lastReply?: string
}
export type ConversationBranchPrepareResult = { branch: ConversationBranchRecord }
/** A Claude chat on the host and the conversation it runs, for clients that cannot read the
 *  chat's Claude id themselves (the phone). */
export type ConversationBranchChat = { sessionId: string; providerSessionId: string }
export type ConversationBranchListResult = {
  branches: ConversationBranchRecord[]
  /** Absent from hosts that predate it. */
  chats?: ConversationBranchChat[]
}

/** Refusal codes a client maps to copy; anything else is shown as a generic failure. */
export const CONVERSATION_BRANCH_ERRORS = [
  'conversation_branch_source_busy',
  'conversation_branch_invalid_anchor',
  'conversation_branch_history_missing',
  'conversation_branch_workspace_mismatch',
  'conversation_branch_fork_unverified',
  'conversation_branch_not_found',
  'conversation_branch_unavailable'
] as const
export type ConversationBranchError = (typeof CONVERSATION_BRANCH_ERRORS)[number]

export function conversationBranchErrorCode(error: unknown): ConversationBranchError | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return CONVERSATION_BRANCH_ERRORS.find((code) => message.includes(code)) ?? null
}

/** The branches started from `providerSessionId`, oldest first. */
export function conversationBranchChildren(
  branches: readonly ConversationBranchRecord[],
  providerSessionId: string
): ConversationBranchRecord[] {
  return (
    branches
      .filter((branch) => branch.parent.providerSessionId === providerSessionId)
      // filter() made a copy; Hermes on the phone has no toSorted.
      .sort((left, right) => left.createdAt - right.createdAt)
  )
}

/** The branch whose child is `providerSessionId`, if it is one. */
export function conversationBranchOf(
  branches: readonly ConversationBranchRecord[],
  providerSessionId: string
): ConversationBranchRecord | null {
  return branches.find((branch) => branch.child.providerSessionId === providerSessionId) ?? null
}

/** Walks parents up to the conversation no branch started; bounded against a corrupt cycle. */
export function conversationBranchRoot(
  branches: readonly ConversationBranchRecord[],
  providerSessionId: string
): string {
  let cursor = providerSessionId
  for (let depth = 0; depth < 64; depth += 1) {
    const branch = conversationBranchOf(branches, cursor)
    if (!branch) {
      return cursor
    }
    cursor = branch.parent.providerSessionId
  }
  return cursor
}

/** What a branch hands back: its reply under a line naming the branch. */
export function conversationBranchReturnDraft(label: string, reply: string): string {
  return `Result of the branch "${label}":\n\n${reply.trim()}`
}
