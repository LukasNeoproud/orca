import { z } from 'zod'
import {
  CreateIntentParams,
  ExecutionLocation,
  MutationEnvelope,
  SessionId
} from './structured-agent-session-schemas'

const MAX_ID_LENGTH = 512
const MAX_PROMPT_BYTES = 256 * 1024
const MAX_LABEL = 512
const Identifier = (message: string, maxLength = MAX_ID_LENGTH) =>
  z
    .string()
    .min(1, message)
    .max(maxLength, message)
    .refine((value) => value === value.trim(), message)
const BranchIdentifier = Identifier('Invalid branch id')
const BranchRelationKind = z.enum(['discussion', 'subtask', 'alternative'])
const AnchorFields = {
  sourceSessionId: SessionId,
  expectedEpoch: Identifier('Invalid journal epoch'),
  sourceItemId: Identifier('Invalid source item id', 4096)
}

export const BranchPreviewParams = z.object(AnchorFields).strict()

export const BranchPrepareParams = z
  .object({
    branchId: BranchIdentifier,
    title: z.string().trim().min(1).max(MAX_LABEL),
    ...AnchorFields,
    relationKind: BranchRelationKind,
    dependsOnBranchIds: z.array(BranchIdentifier).max(256).optional(),
    target: z.object({ create: CreateIntentParams.omit({ resumeFrom: true }) }).strict(),
    handoff: z.discriminatedUnion('mode', [
      z
        .object({
          mode: z.literal('preserve-history'),
          instruction: z.string().trim().min(1).max(MAX_PROMPT_BYTES),
          historyPreviewSha256: z.string().regex(/^[0-9a-f]{64}$/)
        })
        .strict(),
      z
        .object({
          mode: z.literal('targeted'),
          content: z.string().trim().min(1).max(MAX_PROMPT_BYTES),
          sourceItemIds: z.array(Identifier('Invalid source item id', 4096)).max(10_000)
        })
        .strict()
    ])
  })
  .strict()

export const BranchStartParams = z
  .object({
    branchId: BranchIdentifier,
    envelope: MutationEnvelope,
    retryUnknown: z.literal(true).optional()
  })
  .strict()
export const BranchesParams = z.object({ sessionId: SessionId }).strict()

export const BranchAttachParams = z
  .object({
    branchId: BranchIdentifier,
    title: z.string().trim().min(1).max(MAX_LABEL),
    ...AnchorFields,
    relationKind: BranchRelationKind,
    dependsOnBranchIds: z.array(BranchIdentifier).max(256).optional(),
    targetSessionId: SessionId,
    handoff: z
      .object({
        content: z.string().trim().min(1).max(MAX_PROMPT_BYTES),
        sourceItemIds: z.array(Identifier('Invalid source item id', 4096)).max(10_000)
      })
      .strict()
  })
  .strict()

export const BranchResultPrepareParams = z
  .object({
    returnId: Identifier('Invalid return id'),
    branchId: BranchIdentifier,
    content: z.string().trim().min(1).max(MAX_PROMPT_BYTES)
  })
  .strict()
export const BranchResultSendParams = z
  .object({
    returnId: Identifier('Invalid return id'),
    envelope: MutationEnvelope,
    retryUnknown: z.literal(true).optional()
  })
  .strict()

const BranchProposalItem = z
  .object({
    itemId: Identifier('Invalid proposal item id'),
    branchId: BranchIdentifier,
    title: z.string().trim().min(1).max(MAX_LABEL),
    scope: z.string().trim().min(1).max(MAX_PROMPT_BYTES),
    verification: z.string().trim().min(1).max(MAX_PROMPT_BYTES),
    uncertain: z.boolean(),
    dependencyIds: z.array(Identifier('Invalid dependency id')).max(256),
    workspaceId: Identifier('Invalid workspace id'),
    context: z.string().trim().min(1).max(MAX_PROMPT_BYTES),
    sourceItemIds: z.array(Identifier('Invalid source item id', 4096)).max(10_000),
    action: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('prepare'),
          targetCreate: CreateIntentParams.omit({ resumeFrom: true })
        })
        .strict(),
      z.object({ kind: z.literal('attach'), targetSessionId: SessionId }).strict()
    ])
  })
  .strict()

export const BranchProposalPutParams = z
  .object({
    proposal: z
      .object({
        schemaVersion: z.literal(1),
        proposalId: Identifier('Invalid proposal id'),
        sourceSessionId: SessionId,
        sourceLocation: ExecutionLocation.optional(),
        sourceAnchor: z
          .object({
            epoch: Identifier('Invalid journal epoch'),
            itemId: Identifier('Invalid source item id', 4096)
          })
          .strict(),
        revision: z.number().int().positive(),
        state: z.enum(['offered', 'dismissed', 'confirmed']),
        items: z.array(BranchProposalItem).max(64),
        createdAt: z.number().finite().nonnegative(),
        updatedAt: z.number().finite().nonnegative()
      })
      .strict(),
    expectedRevision: z.number().int().nonnegative()
  })
  .strict()

export const BranchSuggestionPreferenceSetParams = z
  .object({
    sessionId: SessionId,
    scope: z.enum(['session', 'workspace', 'global']),
    enabled: z.boolean()
  })
  .strict()
export const BranchNoticePrepareParams = z
  .object({
    noticeId: Identifier('Invalid notice id'),
    sourceSessionId: SessionId,
    branchIds: z.array(BranchIdentifier).min(1).max(64),
    content: z.string().trim().min(1).max(MAX_PROMPT_BYTES)
  })
  .strict()
export const BranchNoticeSendParams = z
  .object({
    noticeId: Identifier('Invalid notice id'),
    envelope: MutationEnvelope,
    retryUnknown: z.literal(true).optional()
  })
  .strict()
