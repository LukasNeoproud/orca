import type {
  PortableConversationBranchBeginStartResult,
  PortableConversationBranchCompleteStartResult,
  PortableConversationBranchPrepareParams,
  PortableConversationBranchPrepareResult,
  PortableConversationBranchPreviewParams,
  PortableConversationBranchPreviewResult,
  PortableConversationBranchRecord
} from '../../../src/shared/portable-conversation-branch'
import type {
  PortableConversationSource,
  PortableConversationSourceCursor,
  PortableConversationSourcePage
} from '../../../src/shared/portable-conversation-source'
import type { RuntimeMobileSessionCreateTerminalResult } from '../../../src/shared/runtime-types'
import type { RpcClient } from '../transport/rpc-client'

async function call<T>(
  client: Pick<RpcClient, 'sendRequest'>,
  method: string,
  params: unknown
): Promise<T> {
  const response = await client.sendRequest(method, params, { failWhenDisconnected: true })
  if (!response.ok) {
    throw new Error(response.error?.message || 'The owning host rejected the request.')
  }
  return response.result as T
}

export function readMobilePortableSourcePage(
  client: Pick<RpcClient, 'sendRequest'>,
  source: PortableConversationSource,
  cursor?: PortableConversationSourceCursor
): Promise<PortableConversationSourcePage> {
  return call(client, 'portableConversation.sourcePage', {
    source,
    ...(cursor ? { cursor } : {})
  })
}

export function previewMobilePortableBranch(
  client: Pick<RpcClient, 'sendRequest'>,
  params: PortableConversationBranchPreviewParams
): Promise<PortableConversationBranchPreviewResult> {
  return call(client, 'portableConversation.branchPreview', params)
}

export function prepareMobilePortableBranch(
  client: Pick<RpcClient, 'sendRequest'>,
  params: PortableConversationBranchPrepareParams
): Promise<PortableConversationBranchPrepareResult> {
  return call(client, 'portableConversation.branchPrepare', params)
}

export type MobilePortableStartResult = {
  branch: PortableConversationBranchRecord
  worktreeId: string
  outcome: 'accepted' | 'rejected' | 'unknown'
  hasReceipt: boolean
}

export async function startMobilePortableBranch(args: {
  client: Pick<RpcClient, 'sendRequest'>
  branchId: string
  attemptId: string
}): Promise<MobilePortableStartResult> {
  const claim = await call<PortableConversationBranchBeginStartResult>(
    args.client,
    'portableConversation.branchBeginStart',
    { branchId: args.branchId, attemptId: args.attemptId }
  )
  const workspaceId = claim.branch.target.terminal.workspace.workspaceId
  if (!claim.authorized) {
    return {
      branch: claim.branch,
      worktreeId: workspaceId,
      outcome:
        claim.branch.target.terminal.launch?.status === 'accepted'
          ? 'accepted'
          : claim.branch.target.terminal.launch?.status === 'rejected'
            ? 'rejected'
            : 'unknown',
      hasReceipt: claim.branch.target.terminal.launch?.receipt != null
    }
  }

  const created = await call<RuntimeMobileSessionCreateTerminalResult>(
    args.client,
    'session.tabs.createTerminal',
    {
      worktree: `id:${workspaceId}`,
      launchAgent: claim.branch.target.agent,
      clientMutationId: `portable:${args.attemptId}`.slice(0, 128),
      activate: false,
      select: true,
      navigation: 'caller'
    }
  )
  const tab = created.tab
  if (tab.type !== 'terminal' || tab.status !== 'ready' || !tab.terminal) {
    throw new Error(
      'Conversation launch is unverified. Check the target workspace before proceeding.'
    )
  }
  const receipt = {
    tabId: tab.parentTabId,
    leafId: tab.leafId,
    paneKey: `${tab.parentTabId}:${tab.leafId}`,
    ...(tab.ptyId ? { ptyId: tab.ptyId } : {}),
    launchAgent: claim.branch.target.agent
  }
  const saved = await call<PortableConversationBranchCompleteStartResult>(
    args.client,
    'portableConversation.branchCompleteStart',
    {
      branchId: args.branchId,
      attemptId: args.attemptId,
      outcome: { kind: 'launched', receipt }
    }
  )
  const sent = await args.client.sendRequest(
    'terminal.send',
    {
      terminal: tab.terminal,
      text: claim.branch.handoff.content,
      enter: true,
      agentPrompt: true,
      waitSubmitMs: 60_000,
      requireAgentStatus: 'sendable'
    },
    { failWhenDisconnected: true, timeoutMs: 70_000 }
  )
  if (!sent.ok || !terminalSendAccepted(sent.result)) {
    throw new Error(
      'Conversation delivery is unverified. The handoff will not be sent again automatically.'
    )
  }
  // Mobile input acceptance does not prove provider submission. Keep the durable
  // launch unknown so reconnects cannot replay the handoff.
  return { branch: saved.branch, worktreeId: workspaceId, outcome: 'unknown', hasReceipt: true }
}

function terminalSendAccepted(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const send = (value as { send?: unknown }).send
  return !!send && typeof send === 'object' && (send as { accepted?: unknown }).accepted === true
}
