import type {
  AgentSessionBranchPrepareParams,
  AgentSessionBranchPreviewParams,
  AgentSessionBranchPreviewResult,
  AgentSessionBranchRecord,
  AgentSessionBranchesResult
} from '../../../src/shared/agent-session-branch'
import type { AgentSessionHistoryResult } from '../../../src/shared/agent-session-wire'
import { structuredAgentSessionPayloadFingerprint } from '../../../src/shared/structured-agent-session-mutation'
import { structuredAgentSessionSendBody } from '../../../src/shared/structured-agent-session-outbox'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import { structuredSessionOperationId } from './mobile-structured-agent-session-rpc'

export class MobileConversationBranchUnsupportedError extends Error {
  constructor() {
    super('Update Orca on the host to branch structured conversations.')
  }
}

async function callBranch<T>(
  client: Pick<RpcClient, 'sendRequest'>,
  method: string,
  params: unknown,
  options: { timeoutMs?: number; failWhenDisconnected?: boolean } = {}
): Promise<T> {
  const response = await client.sendRequest(method, params, {
    timeoutMs: options.timeoutMs ?? 30_000,
    budgetSpansConnect: true,
    ...(options.failWhenDisconnected ? { failWhenDisconnected: true } : {})
  })
  if (!response.ok) {
    if (response.error.code === 'method_not_found') {
      throw new MobileConversationBranchUnsupportedError()
    }
    throw new Error(response.error.message)
  }
  return (response as RpcSuccess).result as T
}

export function previewMobileConversationBranch(
  client: Pick<RpcClient, 'sendRequest'>,
  source: AgentSessionBranchPreviewParams
): Promise<AgentSessionBranchPreviewResult> {
  return callBranch(client, 'agentSession.branchPreview', source)
}

export function prepareMobileConversationBranch(
  client: Pick<RpcClient, 'sendRequest'>,
  intent: AgentSessionBranchPrepareParams
): Promise<AgentSessionBranchRecord> {
  return callBranch<{ branch: AgentSessionBranchRecord }>(
    client,
    'agentSession.branchPrepare',
    intent,
    {
      timeoutMs: 120_000,
      failWhenDisconnected: true
    }
  ).then((result) => result.branch)
}

export function readMobileConversationFamily(
  client: Pick<RpcClient, 'sendRequest'>,
  sessionId: string
): Promise<AgentSessionBranchesResult> {
  return callBranch(client, 'agentSession.branches', { sessionId })
}

export async function startMobileConversationBranch(args: {
  client: Pick<RpcClient, 'sendRequest'>
  branch: AgentSessionBranchRecord
  operationId: string
}): Promise<AgentSessionBranchRecord> {
  const { client, branch, operationId } = args
  if (branch.state !== 'prepared' && branch.state !== 'delivery-unverified') {
    throw new Error('This related conversation is not ready to start.')
  }
  if (branch.state === 'delivery-unverified') {
    throw new Error('Delivery is unverified. Inspect the related conversation before retrying.')
  }
  const history = await callBranch<AgentSessionHistoryResult>(client, 'agentSession.history', {
    sessionId: branch.target.sessionId,
    direction: 'tail',
    limit: 1
  })
  const fence = history.page.fence ?? (!history.ok ? history.fence : undefined)
  if (fence === undefined) {
    throw new Error(
      'The related conversation checkpoint is unavailable. Reconnect before starting.'
    )
  }
  const body = structuredAgentSessionSendBody(branch.handoff.content, [])
  const result = await callBranch<{ branch: AgentSessionBranchRecord }>(
    client,
    'agentSession.branchStart',
    {
      branchId: branch.branchId,
      envelope: {
        sessionId: branch.target.sessionId,
        clientOperationId: operationId,
        expectedRuntimeFence: fence,
        payloadFingerprint: structuredAgentSessionPayloadFingerprint({
          method: 'agentSession.send',
          sessionId: branch.target.sessionId,
          fields: { body }
        })
      }
    },
    { failWhenDisconnected: true }
  )
  return result.branch
}

export function newMobileConversationBranchOperationId(): string {
  return structuredSessionOperationId()
}
