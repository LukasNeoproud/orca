import { useMemo, useState } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { startConversationBranchInChat } from '@/lib/conversation-branch-launch'
import { ConversationBranchDialog } from '../conversation-branch/ConversationBranchDialog'
import { ConversationBranchSendGuardDialog } from '../conversation-branch/ConversationBranchSendGuardDialog'
import { useConversationBranchSendGuard } from '../conversation-branch/conversation-branch-send-guard'
import { useConversationBranches } from '../conversation-branch/use-conversation-branches'
import { useStructuredAgentSessionStatusSummary } from './StructuredAgentSessionStatusBridge'
import { useNativeChatTabOwnerWorktreeId } from './use-native-chat-tab-owner'
import {
  NativeChatBranchContext,
  type NativeChatBranchRow,
  type NativeChatBranchSurface
} from './native-chat-branch-context'

/** Offers branching on a Claude chat's completed replies, on a host that can branch. */
export function NativeChatBranchProvider({
  session,
  children
}: {
  session: { tabId: string; sessionId: string; agent: AgentType; target: RuntimeClientTarget }
  children: React.ReactNode
}): React.JSX.Element {
  const worktreeId = useNativeChatTabOwnerWorktreeId(session.tabId)
  const claudeWorktreeId = session.agent === 'claude' ? worktreeId : null
  const { supported, branches } = useConversationBranches(session.target, claudeWorktreeId)
  const providerSessionId =
    useStructuredAgentSessionStatusSummary(session.sessionId, session.target).summary
      ?.providerSession?.id ?? null
  const guard = useConversationBranchSendGuard({
    target: session.target,
    sessionId: session.sessionId,
    worktreeId: claudeWorktreeId,
    providerSessionId,
    branches
  })
  const { guardSend } = guard
  // One request per opened dialog: a retry after a failure is the same branch, never a second.
  const [request, setRequest] = useState<{ row: NativeChatBranchRow; requestId: string } | null>(
    null
  )
  const surface = useMemo<NativeChatBranchSurface | undefined>(
    () =>
      supported && claudeWorktreeId
        ? {
            branchFrom: (row) => setRequest({ row, requestId: newAgentLaunchRequestId() }),
            branchesAt: (messageId) =>
              branches.filter(
                (branch) =>
                  branch.parent.structuredSessionId === session.sessionId &&
                  branch.parent.replyItemId === messageId
              ),
            family: {
              branches,
              providerSessionId,
              target: session.target,
              worktreeId: claudeWorktreeId
            },
            guardSend
          }
        : undefined,
    [supported, claudeWorktreeId, branches, providerSessionId, session, guardSend]
  )
  return (
    <NativeChatBranchContext.Provider value={surface}>
      {children}
      {request && claudeWorktreeId ? (
        <ConversationBranchDialog
          replyMarkdown={request.row.markdown}
          onCancel={() => setRequest(null)}
          onCreate={async (values) => {
            await startConversationBranchInChat(session.target, {
              requestId: request.requestId,
              worktreeId: claudeWorktreeId,
              source: { kind: 'chat', sessionId: session.sessionId, itemId: request.row.messageId },
              mode: values.mode,
              label: values.label,
              ...(values.mode === 'compact' ? { focus: values.focus } : {}),
              prompt: values.prompt
            })
            setRequest(null)
          }}
        />
      ) : null}
      {guard.asking ? (
        <ConversationBranchSendGuardDialog
          relatives={guard.asking.relatives}
          onSendNow={guard.sendNow}
          onSendWhenDone={guard.sendWhenDone}
          onCancel={guard.cancel}
        />
      ) : null}
    </NativeChatBranchContext.Provider>
  )
}
