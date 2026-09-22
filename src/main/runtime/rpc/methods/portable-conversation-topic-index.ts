import { z } from 'zod'
import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'
import type {
  PortableConversationTopicIndexParams,
  PortableConversationTopicIndexWriteParams
} from '../../../../shared/portable-conversation-topic-index'
import {
  readPortableConversationTopicIndex,
  writePortableConversationTopicIndex
} from '../../../conversation-branch/portable-conversation-topic-index-service'
import { createRuntimeSshPortableConversationSourceReader } from '../../../conversation-branch/portable-conversation-source-runtime-reader'
import { resolvePortableConversationWorkspace } from '../../portable-conversation-workspace'
import { defineMethod, type RpcAnyMethod, type RpcContext } from '../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredHost
} from './structured-agent-session-gate'

const Identifier = (max = 512) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value === value.trim())
const Source = z
  .object({
    executionHostId: z.string().regex(/^ssh:.+/),
    workspace: z
      .object({
        id: Identifier(4096),
        path: z.string().min(1).max(4096),
        kind: z.enum(['git-worktree', 'folder'])
      })
      .strict(),
    provider: z.object({ agent: z.enum(['claude', 'codex']), sessionId: Identifier() }).strict(),
    transcriptPath: z.string().min(1).max(4096)
  })
  .strict()
const TopicAnchor = z
  .object({
    epoch: Identifier(4096),
    itemId: Identifier(4096),
    sequence: z.number().int().nonnegative()
  })
  .strict()
const TopicChapter = z
  .object({
    id: Identifier(),
    title: z.string().min(1).max(120),
    start: TopicAnchor,
    end: TopicAnchor,
    titleSource: z.enum(['automatic', 'manual']),
    boundaryAfterManual: z.boolean()
  })
  .strict()
const TopicIndex = z
  .object({
    sessionId: Identifier(),
    revision: z.number().int().nonnegative(),
    automatic: z.boolean(),
    chapters: z.array(TopicChapter).max(2_000)
  })
  .strict()
const ReadParams = z
  .object({
    source: Source,
    refresh: z.literal(true).optional(),
    autoRefresh: z.literal(true).optional()
  })
  .strict()
const WriteParams = z
  .object({
    source: Source,
    index: TopicIndex,
    expectedRevision: z.number().int().nonnegative()
  })
  .strict()

async function canonicalSource(
  ctx: RpcContext,
  input: z.infer<typeof Source>
): Promise<PortableConversationSource> {
  const workspace = await resolvePortableConversationWorkspace(
    ctx.runtime,
    input.workspace.id,
    input.executionHostId
  )
  if (workspace.path !== input.workspace.path || workspace.kind !== input.workspace.kind) {
    throw new Error('portable_conversation_workspace_changed')
  }
  return {
    ...input,
    executionHostId: workspace.executionHostId,
    workspace: { id: workspace.workspaceId, path: workspace.path, kind: workspace.kind }
  }
}

async function dependencies(ctx: RpcContext) {
  await ensureStructuredHostInstalled(ctx)
  const store = requireStructuredHost(ctx).deps.portableTopicStore
  if (!store) {
    throw new Error('portable_conversation_topic_index_unsupported')
  }
  return {
    store,
    readPage: createRuntimeSshPortableConversationSourceReader().readPage
  }
}

export const PORTABLE_CONVERSATION_TOPIC_INDEX_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'portableConversation.topicIndex',
    params: ReadParams,
    handler: async (params, ctx) =>
      readPortableConversationTopicIndex(await dependencies(ctx), {
        ...params,
        source: await canonicalSource(ctx, params.source)
      } as PortableConversationTopicIndexParams)
  }),
  defineMethod({
    name: 'portableConversation.writeTopicIndex',
    params: WriteParams,
    handler: async (params, ctx) =>
      writePortableConversationTopicIndex(await dependencies(ctx), {
        ...params,
        source: await canonicalSource(ctx, params.source)
      } as PortableConversationTopicIndexWriteParams)
  })
]
