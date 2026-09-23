import { z } from 'zod'
import {
  AgentContextTransitionInputSchema,
  type AgentContextTransitionRequest
} from '../../../../shared/agent-context-transition'
import {
  AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY,
  AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import {
  AgentContextCallerSchema,
  resolveAgentContextBinding,
  type AgentContextBinding
} from '../../agent-context-binding'
import { captureAgentContextTarget } from '../../agent-context-boundary'
import { conversationContinuationRuntime } from '../../conversation-continuation-runtime'
import {
  structuredAgentContextRequests,
  structuredAgentContextScope
} from './agent-context-structured-scope'
import { defineMethod, type RpcContext, type RpcAnyMethod } from '../core'

const Id = z.string().min(1).max(512)
const Caller = z.object({ caller: AgentContextCallerSchema }).strict()
const Request = Caller.extend({
  requestId: Id.max(256),
  input: AgentContextTransitionInputSchema
}).strict()
const Operation = Caller.extend({ requestId: Id.max(256) }).strict()
const Surface = z.object({ paneKey: Id, providerSessionId: Id }).strict()
const Conversation = z
  .object({ source: z.object({ workspaceId: Id, providerSessionId: Id }).strict() })
  .strict()
const scope = ({ workspaceId, providerSessionId, sourceGeneration }: AgentContextBinding) => ({
  workspaceId,
  providerSessionId,
  sourceGeneration
})

function context(ctx: RpcContext) {
  if (
    (ctx.clientKind || ctx.pairedDeviceId || ctx.clientCapabilities) &&
    !ctx.clientCapabilities?.includes(AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY)
  ) {
    throw new Error('agent_context_unsupported')
  }
  return conversationContinuationRuntime(ctx.runtime)
}

function structuredContext(ctx: RpcContext) {
  if (
    (ctx.clientKind || ctx.pairedDeviceId || ctx.clientCapabilities) &&
    !ctx.clientCapabilities?.includes(AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY)
  ) {
    throw new Error('agent_context_structured_mobile_unsupported')
  }
  return conversationContinuationRuntime(ctx.runtime)
}

function structuredRequests(ctx: RpcContext, sessionId: string) {
  const { transitions } = structuredContext(ctx)
  const identity = structuredAgentContextScope(sessionId)
  const source = {
    workspaceId: identity.workspaceId,
    providerSessionId: identity.providerSessionId
  }
  return {
    identity,
    transitions,
    source,
    requests: structuredAgentContextRequests(transitions.listConversation(source), sessionId)
  }
}

function view(request: AgentContextTransitionRequest | null) {
  return (
    request && {
      requestId: request.requestId,
      status: request.status,
      mode: request.input.mode,
      reason: request.input.reason,
      continuation: request.input.continuation,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      ...(request.errorCode ? { errorCode: request.errorCode } : {}),
      ...(request.result ? { result: request.result } : {})
    }
  )
}

export const AGENT_CONTEXT_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'agentContext.request',
    params: Request,
    handler: async (params, ctx) => {
      const { transitions } = context(ctx)
      const binding = await resolveAgentContextBinding(ctx.runtime, params.caller)
      const previous = transitions.status(scope(binding), params.requestId)
      if (previous) {
        if (JSON.stringify(previous.input) !== JSON.stringify(params.input)) {
          throw new Error('agent_context_request_conflict')
        }
        return { ...view(previous), endTurn: previous.status === 'queued' }
      }
      const target = await captureAgentContextTarget(ctx.runtime, binding)
      const request = await transitions.accept(target, params.input, params.requestId)
      return { ...view(request), endTurn: true }
    }
  }),
  defineMethod({
    name: 'agentContext.status',
    params: Operation,
    handler: async (params, ctx) => {
      const { transitions } = context(ctx)
      return view(
        transitions.status(
          scope(await resolveAgentContextBinding(ctx.runtime, params.caller)),
          params.requestId
        )
      )
    }
  }),
  defineMethod({
    name: 'agentContext.cancel',
    params: Operation,
    handler: async (params, ctx) => {
      const { transitions, surface } = context(ctx)
      const cancelled = await transitions.cancel(
        scope(await resolveAgentContextBinding(ctx.runtime, params.caller)),
        params.requestId
      )
      if (cancelled?.status === 'cancelled') {
        surface.cancel(params.requestId)
      }
      return view(cancelled)
    }
  }),
  defineMethod({
    name: 'agentContext.state',
    params: Caller,
    handler: async (params, ctx) => {
      const { transitions } = context(ctx)
      const binding = await resolveAgentContextBinding(ctx.runtime, params.caller)
      return {
        provider: 'codex',
        policy: ctx.runtime.getConversationContinuationSettings().agentContextAutonomy ?? 'off',
        requests: transitions.list(scope(binding)).map(view)
      }
    }
  }),
  defineMethod({
    name: 'agentContext.surface',
    params: Surface,
    handler: (params, ctx) => context(ctx).surface.surface(params)
  }),
  defineMethod({
    name: 'agentContext.inspect',
    params: Conversation,
    handler: async (params, ctx) => {
      const { transitions } = context(ctx)
      await ctx.runtime.resolveConversationContinuationSource(params.source)
      return transitions.listConversation(params.source).map(view)
    }
  }),
  defineMethod({
    name: 'agentContext.cancelPending',
    params: Conversation.extend({ requestId: Id }),
    handler: async (params, ctx) => {
      const { transitions, surface } = context(ctx)
      await ctx.runtime.resolveConversationContinuationSource(params.source)
      const request = await transitions.cancelConversation(params.source, params.requestId)
      if (request?.status === 'cancelled') {
        surface.cancel(request.requestId)
      }
      return view(request)
    }
  }),
  defineMethod({
    name: 'agentContext.inspectStructured',
    params: z.object({ sessionId: Id }).strict(),
    handler: (params, ctx) => {
      const { identity, requests } = structuredRequests(ctx, params.sessionId)
      return { ...identity, requests: requests.map(view) }
    }
  }),
  defineMethod({
    name: 'agentContext.cancelStructuredPending',
    params: z.object({ sessionId: Id, requestId: Id }).strict(),
    handler: async (params, ctx) => {
      const { requests, source, transitions } = structuredRequests(ctx, params.sessionId)
      const request = requests.find((candidate) => candidate.requestId === params.requestId)
      if (!request || !['queued', 'ready', 'preparing'].includes(request.status)) {
        throw new Error('agent_context_request_not_pending_or_not_owned')
      }
      await transitions.cancelConversation(source, params.requestId)
      const refreshed = structuredRequests(ctx, params.sessionId)
      return { ...refreshed.identity, requests: refreshed.requests.map(view) }
    }
  }),
  defineMethod({
    name: 'agentContext.claimSurface',
    params: Surface.extend({ requestId: Id }),
    handler: (params, ctx) => context(ctx).surface.claimSurface(params)
  }),
  defineMethod({
    name: 'agentContext.completeSurface',
    params: z
      .object({
        requestId: Id,
        claimId: Id,
        result: z.discriminatedUnion('status', [
          z.object({ status: z.literal('completed') }).strict(),
          z.object({ status: z.literal('failed'), error: z.string().max(2048) }).strict()
        ])
      })
      .strict(),
    handler: (params, ctx) => {
      context(ctx).surface.completeSurface(params, params.result)
      return { accepted: true }
    }
  })
]
