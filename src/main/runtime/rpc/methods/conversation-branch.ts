// `conversationBranch.*` — related Claude conversations forked from a completed turn. Additive and
// negotiated: a client calls these only once the host advertises `conversation-branch.v1`.

import {
  ConversationBranchListParams,
  ConversationBranchOutlineParams,
  ConversationBranchPrepareParams,
  ConversationBranchRecordReturnParams
} from '../../../../shared/rpc-contract/conversation-branch-params'
import type {
  ConversationBranchListResult,
  ConversationBranchOutline,
  ConversationBranchPrepareResult
} from '../../../../shared/conversation-branch'
import { getConversationBranchService } from '../../conversation-branch-runtime'
import type { ConversationBranchService } from '../../conversation-branch-service'
import { defineMethod, type RpcContext } from '../core'
import { ensureStructuredHostInstalled } from './structured-agent-session-gate'

// The service lives with the structured chat runtime, which owns the Claude launch it forks with.
async function requireService(ctx: RpcContext): Promise<ConversationBranchService> {
  await ensureStructuredHostInstalled(ctx)
  const service = getConversationBranchService()
  if (!service) {
    throw new Error('conversation_branch_unavailable')
  }
  return service
}

export const CONVERSATION_BRANCH_METHODS = [
  defineMethod({
    name: 'conversationBranch.list',
    permission: 'workspace',
    params: ConversationBranchListParams,
    handler: async (params, ctx): Promise<ConversationBranchListResult> => {
      const service = await requireService(ctx)
      return {
        branches: await service.list(params.worktreeId),
        chats: service.chats(params.worktreeId)
      }
    }
  }),
  defineMethod({
    name: 'conversationBranch.outline',
    permission: 'workspace',
    params: ConversationBranchOutlineParams,
    handler: async (params, ctx): Promise<ConversationBranchOutline> =>
      (await requireService(ctx)).outline(params.providerSessionId)
  }),
  defineMethod({
    name: 'conversationBranch.prepare',
    permission: 'workspace',
    params: ConversationBranchPrepareParams,
    handler: async (params, ctx): Promise<ConversationBranchPrepareResult> => ({
      branch: await (await requireService(ctx)).prepare(params)
    })
  }),
  defineMethod({
    name: 'conversationBranch.recordReturn',
    permission: 'workspace',
    params: ConversationBranchRecordReturnParams,
    handler: async (params, ctx): Promise<ConversationBranchPrepareResult> => ({
      branch: await (await requireService(ctx)).recordReturn(params)
    })
  })
]
