import { z } from 'zod'
import { RESUMABLE_TUI_AGENTS } from '../../../../shared/agent-session-resume'
import type { PortableConversationBranchPrepareParams } from '../../../../shared/portable-conversation-branch'
import { portableConversationSourceSessionId } from '../../../../shared/portable-conversation-branch'
import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'
import {
  beginPortableConversationBranchStart,
  completePortableConversationBranchStart,
  portableConversationBranchFamily
} from '../../../conversation-branch/portable-conversation-branch-delivery'
import {
  preparePortableConversationBranchResult,
  beginPortableConversationBranchResult,
  completePortableConversationBranchResult
} from '../../../conversation-branch/portable-conversation-branch-results'
import {
  preparePortableConversationBranch,
  previewPortableConversationBranch
} from '../../../conversation-branch/portable-conversation-branch-service'
import { createRuntimeSshPortableConversationSourceReader } from '../../../conversation-branch/portable-conversation-source-runtime-reader'
import { runtimeSshSourceReaderDependencies } from '../../../conversation-branch/portable-conversation-source-runtime-reader'
import {
  resolvePortableConversationBranchTarget,
  resolvePortableConversationFamilyTargets
} from '../../../conversation-branch/portable-conversation-branch-target-resolver'
import { resolvePortableConversationWorkspace } from '../../portable-conversation-workspace'
import { defineMethod, type RpcAnyMethod, type RpcContext } from '../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredHost
} from './structured-agent-session-gate'

const Identifier = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim())
const Prompt = z
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
const Source = z
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
const Anchor = z
  .object({
    messageId: z.string().min(1).max(4096),
    cursor: Cursor,
    identity: Identity,
    selectedText: z
      .string()
      .max(256 * 1024)
      .optional()
  })
  .strict()
const PreviewParams = z
  .object({
    source: Source,
    anchor: Anchor,
    mode: z.enum(['history', 'targeted']),
    anchorRole: z.enum(['user', 'assistant']).optional()
  })
  .strict()
const PrepareParams = z
  .object({
    branchId: Identifier,
    title: z.string().trim().min(1).max(512),
    relationKind: z.enum(['discussion', 'subtask', 'alternative']),
    dependsOnBranchIds: z.array(Identifier).max(256).optional(),
    source: Source,
    anchor: Anchor,
    anchorRole: z.enum(['user', 'assistant']).optional(),
    target: z
      .object({
        sessionId: Identifier,
        agent: z.enum(['claude', 'codex']),
        workspaceId: Identifier,
        executionHostId: ExecutionHost
      })
      .strict(),
    handoff: z
      .object({
        mode: z.enum(['history', 'targeted']),
        content: Prompt,
        sourceContextSha256: z.string().regex(/^[0-9a-f]{64}$/)
      })
      .strict()
  })
  .strict()
const Attempt = z.object({ branchId: Identifier, attemptId: Identifier }).strict()
const ProviderSession = z
  .object({
    key: z.enum(['session_id', 'conversation_id']),
    id: Identifier,
    transcriptPath: z.string().min(1).max(4096).optional()
  })
  .strict()
const Receipt = z
  .object({
    tabId: Identifier,
    leafId: Identifier.optional(),
    paneKey: Identifier.optional(),
    ptyId: Identifier.optional(),
    launchAgent: z.enum(RESUMABLE_TUI_AGENTS).optional(),
    providerSession: ProviderSession.optional(),
    history: z
      .object({
        filePath: z.string().min(1).max(4096),
        codexHome: z.string().min(1).max(4096).optional(),
        cwd: z.string().min(1).max(4096).optional()
      })
      .strict()
      .optional()
  })
  .strict()
const CompleteStartParams = Attempt.extend({
  outcome: z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('launched'),
        receipt: Receipt,
        acknowledged: z.literal(true).optional()
      })
      .strict(),
    z
      .object({ kind: z.literal('failed-before-launch'), reason: z.string().min(1).max(4096) })
      .strict()
  ])
}).strict()
const ResultPrepareParams = z
  .object({ returnId: Identifier, branchId: Identifier, content: Prompt })
  .strict()
const ResultAttempt = z.object({ returnId: Identifier, attemptId: Identifier }).strict()
const ResultCompleteParams = ResultAttempt.extend({
  status: z.enum(['accepted', 'rejected', 'unknown']),
  reason: z.string().min(1).max(4096).optional()
}).strict()

async function branchDependencies(ctx: RpcContext) {
  await ensureStructuredHostInstalled(ctx)
  const store = requireStructuredHost(ctx).deps.branchStore
  if (!store) {
    throw new Error('portable_conversation_branch_unsupported')
  }
  const reader = createRuntimeSshPortableConversationSourceReader()
  const sourceDependencies = runtimeSshSourceReaderDependencies()
  return {
    store,
    readContext: reader.readContext,
    readPage: reader.readPage,
    listSessions: sourceDependencies.listSessions,
    resolveWorkspace: (workspaceId: string, executionHostId: string) =>
      resolvePortableConversationWorkspace(ctx.runtime, workspaceId, executionHostId)
  }
}

async function canonicalPreview(ctx: RpcContext, params: z.infer<typeof PreviewParams>) {
  return { ...params, source: await canonicalSource(ctx, params.source) }
}

async function canonicalSource(
  ctx: RpcContext,
  sourceInput: z.infer<typeof Source>
): Promise<PortableConversationSource> {
  const workspace = await resolvePortableConversationWorkspace(
    ctx.runtime,
    sourceInput.workspace.id,
    sourceInput.executionHostId
  )
  if (
    workspace.path !== sourceInput.workspace.path ||
    workspace.kind !== sourceInput.workspace.kind
  ) {
    throw new Error('portable_conversation_workspace_changed')
  }
  const source: PortableConversationSource = {
    ...sourceInput,
    executionHostId: workspace.executionHostId,
    workspace: { id: workspace.workspaceId, path: workspace.path, kind: workspace.kind }
  }
  return source
}

export const PORTABLE_CONVERSATION_BRANCH_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'portableConversation.branchPreview',
    params: PreviewParams,
    handler: async (params, ctx) =>
      previewPortableConversationBranch(
        await branchDependencies(ctx),
        await canonicalPreview(ctx, params)
      )
  }),
  defineMethod({
    name: 'portableConversation.branchPrepare',
    params: PrepareParams,
    handler: async (params, ctx) => ({
      branch: await preparePortableConversationBranch(
        await branchDependencies(ctx),
        params as PortableConversationBranchPrepareParams
      )
    })
  }),
  defineMethod({
    name: 'portableConversation.branchBeginStart',
    params: Attempt,
    handler: async (params, ctx) => {
      const { store } = await branchDependencies(ctx)
      return beginPortableConversationBranchStart(store, params)
    }
  }),
  defineMethod({
    name: 'portableConversation.branchCompleteStart',
    params: CompleteStartParams,
    handler: async (params, ctx) => {
      const { store } = await branchDependencies(ctx)
      return { branch: await completePortableConversationBranchStart(store, params) }
    }
  }),
  defineMethod({
    name: 'portableConversation.branchResolveTarget',
    params: z.object({ branchId: Identifier }).strict(),
    handler: async (params, ctx) => ({
      branch: await resolvePortableConversationBranchTarget(
        await branchDependencies(ctx),
        params.branchId
      )
    })
  }),
  defineMethod({
    name: 'portableConversation.branches',
    params: z.object({ sessionId: Identifier, source: Source.optional() }).strict(),
    handler: async (params, ctx) => {
      const dependencies = await branchDependencies(ctx)
      if (params.source) {
        const source = await canonicalSource(ctx, params.source)
        if (portableConversationSourceSessionId(source) !== params.sessionId) {
          throw new Error('portable_conversation_branch_source_mismatch')
        }
        await resolvePortableConversationFamilyTargets(dependencies, source)
      }
      return portableConversationBranchFamily(dependencies.store, params.sessionId)
    }
  }),
  defineMethod({
    name: 'portableConversation.branchResultPrepare',
    params: ResultPrepareParams,
    handler: async (params, ctx) => {
      const { store } = await branchDependencies(ctx)
      return { result: await preparePortableConversationBranchResult(store, params) }
    }
  }),
  defineMethod({
    name: 'portableConversation.branchResultBegin',
    params: ResultAttempt,
    handler: async (params, ctx) => {
      const { store } = await branchDependencies(ctx)
      return beginPortableConversationBranchResult(store, params)
    }
  }),
  defineMethod({
    name: 'portableConversation.branchResultComplete',
    params: ResultCompleteParams,
    handler: async (params, ctx) => {
      const { store } = await branchDependencies(ctx)
      return { result: await completePortableConversationBranchResult(store, params) }
    }
  })
]
