import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'
import { createRuntimeSshPortableConversationSourceReader } from '../../../conversation-branch/portable-conversation-source-runtime-reader'
import { resolvePortableConversationWorkspace } from '../../portable-conversation-workspace'

const Source = z.object({
  executionHostId: z.string().regex(/^ssh:.+/),
  workspace: z.object({
    id: z.string().min(1).max(4096),
    path: z.string().min(1).max(4096),
    kind: z.enum(['git-worktree', 'folder'])
  }),
  provider: z.object({ agent: z.enum(['claude', 'codex']), sessionId: z.string().min(1).max(512) }),
  transcriptPath: z.string().min(1).max(4096)
})
const Cursor = z.object({
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  boundaryCheckpoint: z.string().max(4096).nullable(),
  fileFingerprint: z.string().min(1).max(4096)
})
const Anchor = z.object({
  messageId: z.string().min(1).max(4096),
  cursor: Cursor,
  identity: z.object({
    fingerprint: z.string().min(1).max(4096),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    mtimeMs: z.number().finite()
  }),
  selectedText: z
    .string()
    .max(256 * 1024)
    .optional()
})

async function canonicalSource(
  runtime: OrcaRuntimeService,
  input: z.infer<typeof Source>
): Promise<PortableConversationSource> {
  const workspace = await resolvePortableConversationWorkspace(
    runtime,
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

export const PORTABLE_CONVERSATION_SOURCE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'portableConversation.sourceSession',
    params: z.object({ source: Source }),
    handler: async (params, { runtime }) =>
      createRuntimeSshPortableConversationSourceReader().readSession(
        await canonicalSource(runtime, params.source)
      )
  }),
  defineMethod({
    name: 'portableConversation.sourcePage',
    params: z.object({ source: Source, cursor: Cursor.optional() }),
    handler: async (params, { runtime }) =>
      createRuntimeSshPortableConversationSourceReader().readPage({
        source: await canonicalSource(runtime, params.source),
        cursor: params.cursor
      })
  }),
  defineMethod({
    name: 'portableConversation.sourceContext',
    params: z.object({ source: Source, anchor: Anchor, mode: z.enum(['history', 'targeted']) }),
    handler: async (params, { runtime }) =>
      createRuntimeSshPortableConversationSourceReader().readContext({
        source: await canonicalSource(runtime, params.source),
        anchor: params.anchor,
        mode: params.mode
      })
  })
]
