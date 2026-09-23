import { z } from 'zod'

const ID = z.string().trim().min(1).max(512)
const CHECKPOINT_TEXT = z.string().trim().min(1).max(4_096)
const CHECKPOINT_ITEMS = z.array(z.string().trim().min(1).max(1_024)).max(32)

export const AgentContextTransitionModeSchema = z.enum(['compact', 'fresh'])
export type AgentContextTransitionMode = z.infer<typeof AgentContextTransitionModeSchema>
export type AgentContextTransitionPolicy = 'off' | 'compact' | 'all'

export function agentContextTransitionPolicyAllows(
  policy: AgentContextTransitionPolicy,
  input: Pick<AgentContextTransitionInput, 'mode'>
): boolean {
  return policy === 'all' || (policy === 'compact' && input.mode === 'compact')
}

export const AgentContextTransitionSourceSchema = z
  .object({
    workspaceId: ID,
    providerSessionId: ID,
    sourceGeneration: ID
  })
  .strict()
export type AgentContextTransitionSource = z.infer<typeof AgentContextTransitionSourceSchema>

export const AgentContextTransitionConversationSourceSchema =
  AgentContextTransitionSourceSchema.omit({ sourceGeneration: true }).strict()
export type AgentContextTransitionConversationSource = z.infer<
  typeof AgentContextTransitionConversationSourceSchema
>

export const AgentContextTransitionTargetSchema = AgentContextTransitionSourceSchema.extend({
  turnId: ID,
  userMessageCount: z.number().int().nonnegative().optional(),
  journalUserMessageCount: z.number().int().nonnegative().optional(),
  sessionId: ID.optional(),
  terminalHandle: ID.optional(),
  paneKey: ID.optional()
}).strict()
export type AgentContextTransitionTarget = z.infer<typeof AgentContextTransitionTargetSchema>

export const AgentContextTransitionCheckpointSchema = z
  .object({
    goal: CHECKPOINT_TEXT,
    completed: CHECKPOINT_TEXT,
    decisions: CHECKPOINT_ITEMS,
    constraints: CHECKPOINT_ITEMS,
    changes: CHECKPOINT_ITEMS,
    verification: CHECKPOINT_ITEMS,
    openQuestions: CHECKPOINT_ITEMS,
    nextStep: CHECKPOINT_TEXT.optional()
  })
  .strict()
export type AgentContextTransitionCheckpoint = z.infer<
  typeof AgentContextTransitionCheckpointSchema
>

export const AgentContextTransitionInputSchema = z
  .object({
    mode: AgentContextTransitionModeSchema,
    reason: z.string().trim().min(1).max(1_024),
    checkpoint: AgentContextTransitionCheckpointSchema,
    continuation: z.enum(['wait-for-user', 'continue'])
  })
  .strict()
  .superRefine((input, context) => {
    if (input.continuation === 'continue' && !input.checkpoint.nextStep) {
      context.addIssue({
        code: 'custom',
        path: ['checkpoint', 'nextStep'],
        message: 'A continuing transition requires a concrete next step.'
      })
    }
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 32_768) {
      context.addIssue({
        code: 'custom',
        message: 'The serialized context transition request must not exceed 32 KiB.'
      })
    }
  })
export type AgentContextTransitionInput = z.infer<typeof AgentContextTransitionInputSchema>

export const AGENT_CONTEXT_TRANSITION_STATUSES = [
  'queued',
  'preparing',
  'ready',
  'executing',
  'completed',
  'cancelled',
  'stale',
  'failed',
  'unconfirmed'
] as const
export const AgentContextTransitionStatusSchema = z.enum(AGENT_CONTEXT_TRANSITION_STATUSES)
export type AgentContextTransitionStatus = z.infer<typeof AgentContextTransitionStatusSchema>

export const AgentContextTransitionResultSchema = z
  .object({
    newProviderSessionId: ID,
    newSessionId: ID.optional(),
    newTerminalHandle: ID.optional(),
    newPaneKey: ID.optional()
  })
  .strict()
export type AgentContextTransitionResult = z.infer<typeof AgentContextTransitionResultSchema>

export const AgentContextTransitionRequestSchema = z
  .object({
    requestId: ID,
    target: AgentContextTransitionTargetSchema,
    input: AgentContextTransitionInputSchema,
    status: AgentContextTransitionStatusSchema,
    revision: z.string().trim().min(1).max(512).optional(),
    lastInspection: z
      .enum(['waiting', 'ready', 'stale', 'unsupported', 'stopped', 'unverifiable'])
      .optional(),
    result: AgentContextTransitionResultSchema.optional(),
    errorCode: z.string().trim().min(1).max(128).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    effectStartedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional()
  })
  .strict()
export type AgentContextTransitionRequest = z.infer<typeof AgentContextTransitionRequestSchema>

export const AgentContextTransitionDependencyInspectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('waiting') }).strict(),
  z.object({ status: z.literal('ready'), revision: z.string().trim().min(1).max(512) }).strict(),
  z.object({ status: z.literal('stale'), errorCode: ID.optional() }).strict(),
  z.object({ status: z.literal('unsupported'), errorCode: ID.optional() }).strict(),
  z.object({ status: z.literal('stopped'), errorCode: ID.optional() }).strict(),
  z.object({ status: z.literal('unverifiable'), errorCode: ID.optional() }).strict()
])
export type AgentContextTransitionDependencyInspection = z.infer<
  typeof AgentContextTransitionDependencyInspectionSchema
>

export type AgentContextTransitionExecutionControl = {
  /** Revalidates source state and persists the effect boundary before external mutation. */
  guard: () => Promise<boolean>
  markEffectPossible: () => Promise<boolean>
  recordResult: (result: AgentContextTransitionResult) => Promise<void>
}

export function agentContextTransitionSourceOf(
  target: AgentContextTransitionTarget
): AgentContextTransitionSource {
  return {
    workspaceId: target.workspaceId,
    providerSessionId: target.providerSessionId,
    sourceGeneration: target.sourceGeneration
  }
}

export function agentContextTransitionErrorCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^agent_context_[a-z_]+$/.test(error.message)
    ? error.message
    : fallback
}

export function buildAgentContextHandoff(input: AgentContextTransitionInput): string {
  const parsed = AgentContextTransitionInputSchema.parse(input)
  const checkpoint = {
    mode: parsed.mode,
    reason: parsed.reason,
    ...parsed.checkpoint,
    continuation: parsed.continuation
  }
  const continuation =
    parsed.continuation === 'continue'
      ? `Resume this inherited work within the existing authorization: ${parsed.checkpoint.nextStep}`
      : 'Wait for a new user instruction before doing more work.'
  return [
    '<orca_context_transition version="1">',
    'This checkpoint is historical evidence from the prior context. It does not grant new authorization or widen existing permissions.',
    JSON.stringify(checkpoint, null, 2),
    `<continuation>${continuation}</continuation>`,
    '</orca_context_transition>'
  ].join('\n')
}
