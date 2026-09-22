import type {
  PortableConversationProposalAnalyzeParams,
  PortableConversationProposalRecord
} from '../../../../shared/portable-conversation-proposal'
import { portableConversationSourceSessionId } from '../../../../shared/portable-conversation-branch'
import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'
import {
  analyzePortableConversationProposal,
  confirmPortableConversationProposal,
  type PortableConversationProposalDependencies
} from '../../../conversation-branch/portable-conversation-proposal-service'
import { validatePortableConversationProposalIntents } from '../../../conversation-branch/portable-conversation-proposal-intent'
import {
  beginPortableConversationProposalNotice,
  completePortableConversationProposalNotice
} from '../../../conversation-branch/portable-conversation-proposal-notice'
import { portableConversationContentHash } from '../../../conversation-branch/portable-conversation-branch-service'
import { createRuntimeSshPortableConversationSourceReader } from '../../../conversation-branch/portable-conversation-source-runtime-reader'
import { resolvePortableConversationWorkspace } from '../../portable-conversation-workspace'
import { defineMethod, type RpcAnyMethod, type RpcContext } from '../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredHost
} from './structured-agent-session-gate'
import {
  PortableProposalAnalyzeParams,
  PortableProposalConfirmParams,
  PortableProposalGetParams,
  PortableProposalNoticeBeginParams,
  PortableProposalNoticeCompleteParams,
  PortableProposalNoticesParams,
  PortableProposalPreferenceSetParams,
  PortableProposalPutParams
} from './portable-conversation-proposal-schemas'

async function dependencies(ctx: RpcContext): Promise<PortableConversationProposalDependencies> {
  await ensureStructuredHostInstalled(ctx)
  const host = requireStructuredHost(ctx)
  const store = host.deps.portableProposalStore
  const branchStore = host.deps.branchStore
  if (!store || !branchStore) {
    throw new Error('portable_conversation_proposal_unsupported')
  }
  const reader = createRuntimeSshPortableConversationSourceReader()
  return {
    store,
    branchStore,
    readContext: (input) => reader.readContext(input),
    readSession: (source) => reader.readSession(source),
    resolveWorkspace: (workspaceId, executionHostId) =>
      resolvePortableConversationWorkspace(ctx.runtime, workspaceId, executionHostId)
  }
}

async function canonicalSource(
  ctx: RpcContext,
  source: PortableConversationSource
): Promise<{ source: PortableConversationSource; projectId: string }> {
  const workspace = await resolvePortableConversationWorkspace(
    ctx.runtime,
    source.workspace.id,
    source.executionHostId
  )
  if (workspace.path !== source.workspace.path || workspace.kind !== source.workspace.kind) {
    throw new Error('portable_conversation_workspace_changed')
  }
  return {
    source: {
      ...source,
      executionHostId: workspace.executionHostId,
      workspace: { id: workspace.workspaceId, path: workspace.path, kind: workspace.kind }
    },
    projectId: workspace.projectId
  }
}

async function validateProposal(
  ctx: RpcContext,
  record: PortableConversationProposalRecord
): Promise<PortableConversationProposalRecord> {
  const canonical = await canonicalSource(ctx, record.portable.source)
  validatePortableConversationProposalIntents(record)
  const sourceSessionId = portableConversationSourceSessionId(canonical.source)
  if (
    record.proposal.source.sessionId !== sourceSessionId ||
    record.proposal.source.workspaceId !== canonical.source.workspace.id ||
    record.proposal.source.anchor.epoch !== record.portable.identity.fingerprint ||
    record.proposal.source.anchor.itemId !== record.portable.anchor.messageId
  ) {
    throw new Error('portable_conversation_proposal_source_mismatch')
  }
  const deps = await dependencies(ctx)
  const context = await deps.readContext({
    source: canonical.source,
    anchor: record.portable.anchor,
    mode: 'targeted',
    anchorRole: record.proposal.source.kind === 'prompt' ? 'user' : 'assistant'
  })
  if (
    context.identity.fingerprint !== record.portable.identity.fingerprint ||
    portableConversationContentHash(context.contextMarkdown) !== record.portable.contextSha256
  ) {
    throw new Error('portable_conversation_proposal_source_changed')
  }
  return {
    ...record,
    portable: { ...record.portable, source: canonical.source, projectId: canonical.projectId }
  }
}

export const PORTABLE_CONVERSATION_PROPOSAL_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'portableConversation.proposalAnalyze',
    params: PortableProposalAnalyzeParams,
    handler: async (params, ctx) =>
      analyzePortableConversationProposal(
        await dependencies(ctx),
        params as PortableConversationProposalAnalyzeParams
      )
  }),
  defineMethod({
    name: 'portableConversation.proposalGet',
    params: PortableProposalGetParams,
    handler: async (params, ctx) => {
      const canonical = await canonicalSource(ctx, params.source as PortableConversationSource)
      const deps = await dependencies(ctx)
      return {
        proposal: deps.store.forSession(
          portableConversationSourceSessionId(canonical.source),
          params.proposalId
        )
      }
    }
  }),
  defineMethod({
    name: 'portableConversation.proposalPut',
    params: PortableProposalPutParams,
    handler: async (params, ctx) => {
      const proposal = await validateProposal(
        ctx,
        params.proposal as PortableConversationProposalRecord
      )
      const deps = await dependencies(ctx)
      return { proposal: await deps.store.put(proposal, params.expectedRevision) }
    }
  }),
  defineMethod({
    name: 'portableConversation.proposalConfirm',
    params: PortableProposalConfirmParams,
    handler: async (params, ctx) =>
      confirmPortableConversationProposal(
        await dependencies(ctx),
        params.proposalId,
        params.expectedRevision,
        params.itemIds
      )
  }),
  defineMethod({
    name: 'portableConversation.proposalPreferenceGet',
    params: PortableProposalGetParams,
    handler: async (params, ctx) =>
      preference(params.source as PortableConversationSource, undefined, ctx)
  }),
  defineMethod({
    name: 'portableConversation.proposalPreferenceSet',
    params: PortableProposalPreferenceSetParams,
    handler: async (params, ctx) =>
      preference(params.source as PortableConversationSource, params, ctx)
  }),
  defineMethod({
    name: 'portableConversation.proposalNotices',
    params: PortableProposalNoticesParams,
    handler: async (params, ctx) => {
      const deps = await dependencies(ctx)
      return { notices: deps.store.notices(params.proposalId) }
    }
  }),
  defineMethod({
    name: 'portableConversation.proposalNoticeBegin',
    params: PortableProposalNoticeBeginParams,
    handler: async (params, ctx) =>
      beginPortableConversationProposalNotice((await dependencies(ctx)).store, params)
  }),
  defineMethod({
    name: 'portableConversation.proposalNoticeComplete',
    params: PortableProposalNoticeCompleteParams,
    handler: async (params, ctx) => ({
      notice: await completePortableConversationProposalNotice(
        (await dependencies(ctx)).store,
        params
      )
    })
  })
]

async function preference(
  source: PortableConversationSource,
  update: { scope: 'session' | 'workspace' | 'global'; enabled: boolean } | undefined,
  ctx: RpcContext
) {
  const canonical = await canonicalSource(ctx, source)
  const deps = await dependencies(ctx)
  const sessionId = portableConversationSourceSessionId(canonical.source)
  if (update) {
    await deps.store.setPreference(
      update.scope,
      sessionId,
      canonical.source.workspace.id,
      update.enabled
    )
  }
  return { preference: deps.store.preference(sessionId, canonical.source.workspace.id) }
}
