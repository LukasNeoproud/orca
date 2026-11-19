// Branching a Claude chat from the phone. As on desktop, nothing is sent: a branch opens as a chat
// with its prompt waiting in the composer, and a result handed back lands in the parent's composer.
// The prompt goes into the composer draft of the chat's tab, which the chat's history cannot
// retire the way it retires a launch draft.

import type {
  ConversationBranchChat,
  ConversationBranchMode,
  ConversationBranchRecord
} from '../../../src/shared/conversation-branch'
import type { RpcClient } from '../transport/rpc-client'
import {
  conversationBranchList,
  conversationBranchPrepare,
  conversationBranchRecordReturn
} from './mobile-conversation-branch-operations'
import { setMobileNativeChatDraftText } from './mobile-native-chat-draft-store'
import { mobileNativeChatScopeKey } from './mobile-native-chat-scope-key'
import {
  createMobileStructuredAgentSession,
  createMobileStructuredAgentSessionId,
  revealMobileStructuredAgentSession
} from './mobile-structured-agent-session-launch'
import { structuredSessionRandomUuid } from './structured-session-operation-id'

export type MobileConversationBranchScope = {
  client: RpcClient
  hostId: string
  worktreeId: string
}

export type MobileConversationBranches = {
  branches: ConversationBranchRecord[]
  chats: ConversationBranchChat[]
}

const TIMEOUT_MS = 15_000
// A summarized branch runs Claude's compaction on the host before it answers.
const PREPARE_TIMEOUT_MS = 330_000

export function newMobileConversationBranchRequestId(): string {
  return structuredSessionRandomUuid()
}

export async function listMobileConversationBranches(
  scope: MobileConversationBranchScope
): Promise<MobileConversationBranches> {
  const reply = await conversationBranchList.request(
    scope.client,
    { worktreeId: scope.worktreeId },
    { timeoutMs: TIMEOUT_MS, budgetSpansConnect: true }
  )
  return conversationBranchList.interpret(reply)
}

/** Adds `text` to the composer draft of a chat, after anything already typed there. */
export function appendMobileBranchDraft(
  scope: Pick<MobileConversationBranchScope, 'hostId' | 'worktreeId'>,
  sessionId: string,
  text: string
): void {
  // The host lists a chat's tab under this row id; its composer draft is keyed by it.
  const key = mobileNativeChatScopeKey(scope.hostId, scope.worktreeId, `agent-session:${sessionId}`)
  if (key && text.trim()) {
    setMobileNativeChatDraftText(key, (current) =>
      current.trim() ? `${current.trimEnd()}\n\n${text}` : text
    )
  }
}

/** A new chat on `providerSessionId` (a fresh conversation when null) with `prompt` unsent. */
async function openBranchChat(
  scope: MobileConversationBranchScope,
  providerSessionId: string | null,
  prompt: string
): Promise<string> {
  const sessionId = createMobileStructuredAgentSessionId('claude')
  // Staged before the tab exists, so its composer opens holding it.
  appendMobileBranchDraft(scope, sessionId, prompt)
  const created = await createMobileStructuredAgentSession(
    scope.client,
    scope.worktreeId,
    'claude',
    {
      sessionId,
      ...(providerSessionId ? { resumeFrom: { providerSessionId } } : {})
    }
  )
  if (created.kind !== 'created') {
    throw new Error(
      created.kind === 'unsupported' ? 'Claude chats are not available here.' : created.message
    )
  }
  return created.sessionId
}

export async function startMobileConversationBranch(
  scope: MobileConversationBranchScope,
  request: {
    requestId: string
    sourceSessionId: string
    itemId: string
    mode: ConversationBranchMode
    label: string
    focus?: string
    prompt: string
  }
): Promise<ConversationBranchRecord> {
  const prepare = async (childStructuredSessionId?: string) => {
    const reply = await conversationBranchPrepare.request(
      scope.client,
      {
        requestId: request.requestId,
        worktreeId: scope.worktreeId,
        source: { kind: 'chat', sessionId: request.sourceSessionId, itemId: request.itemId },
        mode: request.mode,
        surface: 'chat',
        label: request.label,
        ...(request.mode === 'compact' && request.focus ? { focus: request.focus } : {}),
        ...(childStructuredSessionId ? { childStructuredSessionId } : {})
      },
      { timeoutMs: PREPARE_TIMEOUT_MS, budgetSpansConnect: true }
    )
    return conversationBranchPrepare.interpret(reply).branch
  }
  if (request.mode === 'clean') {
    return prepare(await openBranchChat(scope, null, request.prompt))
  }
  const branch = await prepare()
  if (!branch.child.providerSessionId) {
    throw new Error('conversation_branch_fork_unverified')
  }
  await openBranchChat(scope, branch.child.providerSessionId, request.prompt)
  return branch
}

/** Shows a family member: its chat when the host has one, else a new chat resuming it. */
export async function openMobileConversationMember(
  scope: MobileConversationBranchScope,
  chats: readonly ConversationBranchChat[],
  providerSessionId: string,
  draft = ''
): Promise<void> {
  const chat = chats.find((candidate) => candidate.providerSessionId === providerSessionId)
  if (!chat) {
    await openBranchChat(scope, providerSessionId, draft)
    return
  }
  appendMobileBranchDraft(scope, chat.sessionId, draft)
  await revealMobileStructuredAgentSession(scope.client, chat.sessionId)
}

/** Hands a branch's result to the conversation it came from, as a draft there. The host keeps a
 *  copy; failing to keep it does not undo the hand-back, so it reports instead of throwing. */
export async function returnMobileConversationBranchResult(
  scope: MobileConversationBranchScope,
  chats: readonly ConversationBranchChat[],
  branch: ConversationBranchRecord,
  content: string
): Promise<{ recorded: boolean }> {
  await openMobileConversationMember(scope, chats, branch.parent.providerSessionId, content)
  try {
    const reply = await conversationBranchRecordReturn.request(
      scope.client,
      { branchId: branch.branchId, returnId: newMobileConversationBranchRequestId(), content },
      { timeoutMs: TIMEOUT_MS, budgetSpansConnect: true }
    )
    conversationBranchRecordReturn.interpret(reply)
    return { recorded: true }
  } catch {
    return { recorded: false }
  }
}
