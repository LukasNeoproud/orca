import { z } from 'zod'
import { ConversationBranchRecordSchema } from '../../../src/shared/conversation-branch'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'

// The phone's side of `conversationBranch.*`. Called only once the host advertises
// `conversation-branch.v1`; a refusal throws the host's message, which carries the error code.

const listReplySchema = z.object({
  branches: z.array(ConversationBranchRecordSchema),
  chats: z
    .array(z.object({ sessionId: z.string(), providerSessionId: z.string() }))
    .optional()
    .default([])
})

const branchReplySchema = z.object({ branch: ConversationBranchRecordSchema })

export const conversationBranchList = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'conversation-branch.list',
    method: 'conversationBranch.list',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('conversation-branches', listReplySchema)
  })
)

export const conversationBranchPrepare = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'conversation-branch.prepare',
    method: 'conversationBranch.prepare',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('conversation-branch', branchReplySchema)
  })
)

export const conversationBranchRecordReturn = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'conversation-branch.record-return',
    method: 'conversationBranch.recordReturn',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('conversation-branch', branchReplySchema)
  })
)
