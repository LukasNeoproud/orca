import { z } from 'zod'

const Identifier = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim())
const Text = z
  .string()
  .min(1)
  .max(256 * 1024)
const ExecutionHost = z.string().regex(/^ssh:.+/)
const Workspace = z
  .object({
    id: z.string().min(1).max(4096),
    path: z.string().min(1).max(4096),
    kind: z.enum(['git-worktree', 'folder'])
  })
  .strict()
export const PortableProposalSource = z
  .object({
    executionHostId: ExecutionHost,
    workspace: Workspace,
    provider: z.object({ agent: z.enum(['claude', 'codex']), sessionId: Identifier }).strict(),
    transcriptPath: z.string().min(1).max(4096)
  })
  .strict()
const Cursor = z
  .object({
    offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    boundaryCheckpoint: z.string().max(4096).nullable(),
    fileFingerprint: z.string().min(1).max(4096)
  })
  .strict()
const Identity = z
  .object({
    fingerprint: z.string().min(1).max(4096),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    mtimeMs: z.number().finite()
  })
  .strict()
export const PortableProposalAnchor = z
  .object({
    messageId: z.string().min(1).max(4096),
    cursor: Cursor,
    identity: Identity,
    selectedText: Text.optional()
  })
  .strict()

const ProposalSource = z
  .object({
    sessionId: Identifier,
    workspaceId: Identifier,
    kind: z.enum(['prompt', 'review']),
    anchor: z.object({ epoch: Identifier, itemId: z.string().min(1).max(4096) }).strict(),
    passages: z
      .array(z.object({ itemId: z.string().min(1).max(4096), text: Text }).strict())
      .max(24)
  })
  .strict()
const ItemBase = {
  itemId: Identifier,
  branchId: Identifier,
  name: z
    .string()
    .min(1)
    .max(120)
    .refine((value) => value.trim().length > 0),
  scope: z
    .string()
    .min(1)
    .max(4000)
    .refine((value) => value.trim().length > 0),
  verification: z
    .string()
    .min(1)
    .max(1000)
    .refine((value) => value.trim().length > 0),
  dependencyIds: z.array(Identifier).max(64),
  workspaceId: Identifier,
  context: z
    .object({
      content: z
        .string()
        .min(1)
        .max(4000)
        .refine((value) => value.trim().length > 0),
      sourceItemIds: z.array(Identifier).max(24)
    })
    .strict(),
  relationKind: z.literal('subtask'),
  action: z.enum(['prepare', 'attach', 'reject']),
  targetSessionId: Identifier.optional(),
  uncertain: z.boolean()
}
const ProposalItem = z
  .object({
    ...ItemBase,
    intent: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('prepare'),
          targetSessionId: Identifier,
          agent: z.enum(['claude', 'codex']),
          workspaceId: Identifier,
          executionHostId: ExecutionHost
        })
        .strict(),
      z.object({ kind: z.literal('attach'), target: PortableProposalSource }).strict(),
      z.object({ kind: z.literal('reject') }).strict()
    ])
  })
  .strict()
const ItemResult = z
  .object({
    itemId: Identifier,
    branchId: Identifier,
    status: z.enum(['prepared', 'attached', 'failed', 'unknown']),
    targetSessionId: Identifier.optional(),
    message: z.string().max(4096).optional()
  })
  .strict()
const Record = z
  .object({
    schemaVersion: z.literal(1),
    proposal: z
      .object({
        proposalId: Identifier,
        source: ProposalSource,
        items: z.array(ProposalItem).max(6),
        shouldOffer: z.boolean(),
        analysis: z.enum(['deterministic', 'provider']),
        truncated: z.boolean()
      })
      .strict(),
    portable: z
      .object({
        source: PortableProposalSource,
        anchor: PortableProposalAnchor,
        identity: Identity,
        contextSha256: z.string().regex(/^[0-9a-f]{64}$/),
        projectId: Identifier
      })
      .strict(),
    revision: z.number().int().positive(),
    state: z.enum(['offered', 'dismissed', 'confirmed']),
    results: z.array(ItemResult).max(6),
    createdAt: z.number().finite().nonnegative(),
    updatedAt: z.number().finite().nonnegative()
  })
  .strict()

export const PortableProposalAnalyzeParams = z
  .object({
    source: PortableProposalSource,
    anchor: PortableProposalAnchor,
    kind: z.enum(['prompt', 'review'])
  })
  .strict()
export const PortableProposalGetParams = z
  .object({ source: PortableProposalSource, proposalId: Identifier.optional() })
  .strict()
export const PortableProposalPutParams = z
  .object({ proposal: Record, expectedRevision: z.number().int().nonnegative() })
  .strict()
export const PortableProposalConfirmParams = z
  .object({
    proposalId: Identifier,
    expectedRevision: z.number().int().positive(),
    itemIds: z.array(Identifier).max(6).optional()
  })
  .strict()
export const PortableProposalPreferenceSetParams = z
  .object({
    source: PortableProposalSource,
    scope: z.enum(['session', 'workspace', 'global']),
    enabled: z.boolean()
  })
  .strict()
export const PortableProposalNoticesParams = z.object({ proposalId: Identifier }).strict()
export const PortableProposalNoticeBeginParams = z
  .object({ noticeId: Identifier, attemptId: Identifier })
  .strict()
export const PortableProposalNoticeCompleteParams = z
  .object({
    noticeId: Identifier,
    attemptId: Identifier,
    status: z.enum(['accepted', 'rejected', 'unknown']),
    reason: z.string().max(4096).optional()
  })
  .strict()
