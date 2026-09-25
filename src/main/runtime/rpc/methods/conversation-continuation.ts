import { z } from 'zod'
import { defineMethod, type RpcAnyMethod } from '../core'
import { conversationContinuationRuntime } from '../../conversation-continuation-runtime'

const Identifier = z.string().min(1).max(512)
const Source = z.object({ providerSessionId: Identifier, workspaceId: Identifier }).strict()
const Inspect = z.object({ source: Source }).strict()
const Prepare = z.object({ source: Source, expectedRevision: z.string().min(1).max(512) }).strict()
const CandidateReference = Prepare.extend({ candidateId: Identifier }).strict()

export const CONVERSATION_CONTINUATION_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'conversationContinuation.inspect',
    params: Inspect,
    handler: (params, ctx) =>
      conversationContinuationRuntime(ctx.runtime).scheduler.inspect(params.source)
  }),
  defineMethod({
    name: 'conversationContinuation.prepare',
    params: Prepare,
    handler: (params, ctx) =>
      conversationContinuationRuntime(ctx.runtime).scheduler.prepare(
        params.source,
        params.expectedRevision
      )
  }),
  defineMethod({
    name: 'conversationContinuation.reference',
    params: Prepare,
    handler: async (params, ctx) => {
      const { service, scheduler } = conversationContinuationRuntime(ctx.runtime)
      const current = await scheduler.inspect(params.source)
      if (current.checkpoint?.revision !== params.expectedRevision) {
        throw new Error('The conversation changed. Refresh before continuing.')
      }
      return service.prepareReference(params)
    }
  }),
  defineMethod({
    name: 'conversationContinuation.candidateReference',
    params: CandidateReference,
    handler: (params, ctx) =>
      conversationContinuationRuntime(ctx.runtime).service.prepareCandidateReference(params)
  }),
  defineMethod({
    name: 'conversationContinuation.claim',
    params: z.object({ candidateId: Identifier }).strict(),
    handler: (params, ctx) =>
      conversationContinuationRuntime(ctx.runtime).service.claim(params.candidateId)
  })
]
