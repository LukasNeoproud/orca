import type { RpcAnyMethod, RpcContext } from '../core'
import { defineMethod } from '../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredHost,
  structuredCallerFor
} from './structured-agent-session-gate'
import {
  BranchAttachParams,
  BranchNoticePrepareParams,
  BranchNoticeSendParams,
  BranchPrepareParams,
  BranchPreviewParams,
  BranchProposalPutParams,
  BranchResultPrepareParams,
  BranchResultSendParams,
  BranchesParams,
  BranchStartParams,
  BranchSuggestionPreferenceSetParams
} from './structured-agent-session-branch-schemas'
import { readAgentSessionBranchContext } from '../../../native-chat/agent-session-wire/structured-agent-session-branch-context'
import { startPreparedAgentSessionBranch } from '../../../native-chat/agent-session-wire/structured-agent-session-branch-service'
import {
  attachExistingAgentSessionBranch,
  prepareAgentSessionBranchResult,
  sendAgentSessionBranchResult
} from '../../../native-chat/agent-session-wire/structured-agent-session-branch-relations'
import {
  prepareAgentSessionBranchNotice,
  sendAgentSessionBranchNotice
} from '../../../native-chat/agent-session-wire/structured-agent-session-branch-notice'
import { requireBranchCapability } from './structured-agent-session-branch-gate'
import { prepareAgentSessionBranch } from './structured-agent-session-branch-prepare'

const readMethods: RpcAnyMethod[] = [
  defineMethod({
    name: 'agentSession.branchPreview',
    params: BranchPreviewParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      const {
        items: _items,
        excerpt: _excerpt,
        sourceProviderSessionId: _provider,
        ...preview
      } = await readAgentSessionBranchContext(requireStructuredHost(ctx), params)
      return preview
    }
  }),
  defineMethod({
    name: 'agentSession.branches',
    params: BranchesParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      const store = requireStructuredHost(ctx).deps.branchStore
      if (!store) {
        throw new Error('agent_session_branch_unsupported')
      }
      return {
        branches: store.family(params.sessionId),
        returns: store.returnsFor(params.sessionId)
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchNotices',
    params: BranchesParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      const store = requireStructuredHost(ctx).deps.branchStore
      if (!store) {
        throw new Error('agent_session_branch_unsupported')
      }
      return { notices: store.noticesFor(params.sessionId) }
    }
  })
]

export const STRUCTURED_AGENT_SESSION_BRANCH_METHODS: RpcAnyMethod[] = [
  ...readMethods,
  defineMethod({
    name: 'agentSession.branchPrepare',
    params: BranchPrepareParams,
    handler: prepareAgentSessionBranch
  }),
  defineMethod({
    name: 'agentSession.branchStart',
    params: BranchStartParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      return {
        branch: await startPreparedAgentSessionBranch({
          host: requireStructuredHost(ctx),
          caller: structuredCallerFor(ctx),
          params
        })
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchAttach',
    params: BranchAttachParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      return {
        branch: await attachExistingAgentSessionBranch({ host: requireStructuredHost(ctx), params })
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchResultPrepare',
    params: BranchResultPrepareParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      return {
        result: await prepareAgentSessionBranchResult({ host: requireStructuredHost(ctx), params })
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchResultSend',
    params: BranchResultSendParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      return {
        result: await sendAgentSessionBranchResult({
          host: requireStructuredHost(ctx),
          caller: structuredCallerFor(ctx),
          params
        })
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchNoticePrepare',
    params: BranchNoticePrepareParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      return {
        notice: await prepareAgentSessionBranchNotice({ host: requireStructuredHost(ctx), params })
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchNoticeSend',
    params: BranchNoticeSendParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      return {
        notice: await sendAgentSessionBranchNotice({
          host: requireStructuredHost(ctx),
          caller: structuredCallerFor(ctx),
          params
        })
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchProposalGet',
    params: BranchesParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      const store = requireStructuredHost(ctx).deps.branchStore
      if (!store) {
        throw new Error('agent_session_branch_unsupported')
      }
      return { proposal: store.proposalFor(params.sessionId) }
    }
  }),
  defineMethod({
    name: 'agentSession.branchProposalPut',
    params: BranchProposalPutParams,
    handler: async (params, ctx) => {
      requireBranchCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      const host = requireStructuredHost(ctx),
        store = host.deps.branchStore
      const source = host.deps.store.getRecord(params.proposal.sourceSessionId)
      if (!store || !source) {
        throw new Error('agent_session_branch_source_missing')
      }
      return {
        proposal: await store.putProposal(
          { ...params.proposal, sourceLocation: source.location },
          params.expectedRevision
        )
      }
    }
  }),
  defineMethod({
    name: 'agentSession.branchSuggestionPreferenceGet',
    params: BranchesParams,
    handler: async (params, ctx) => preference(params.sessionId, undefined, ctx)
  }),
  defineMethod({
    name: 'agentSession.branchSuggestionPreferenceSet',
    params: BranchSuggestionPreferenceSetParams,
    handler: async (params, ctx) => preference(params.sessionId, params, ctx)
  })
]

async function preference(
  sessionId: string,
  update: typeof BranchSuggestionPreferenceSetParams._output | undefined,
  ctx: RpcContext
) {
  requireBranchCapability(ctx)
  await ensureStructuredHostInstalled(ctx)
  const host = requireStructuredHost(ctx),
    store = host.deps.branchStore,
    record = host.deps.store.getRecord(sessionId)
  if (!store || !record) {
    throw new Error('agent_session_branch_source_missing')
  }
  if (update) {
    await store.setPreference(update.scope, sessionId, record.location, update.enabled)
  }
  return store.preferenceFor(sessionId, record.location)
}
