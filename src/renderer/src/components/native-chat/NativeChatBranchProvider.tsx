import { useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import {
  startConversationBranchBatch,
  startConversationBranchInChat
} from '@/lib/conversation-branch-launch'
import { ConversationBranchDialog } from '../conversation-branch/ConversationBranchDialog'
import { ConversationBranchBatchDialog } from '../conversation-branch/ConversationBranchBatchDialog'
import { ConversationBranchReturnDialog } from '../conversation-branch/ConversationBranchReturnDialog'
import {
  conversationBranchReturnDraft,
  returnConversationBranchResult
} from '@/lib/conversation-branch-return'
import { conversationBranchOf } from '../../../../shared/conversation-branch'
import type { ConversationBranchFinding } from '../../../../shared/conversation-branch-findings'
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
  const [batch, setBatch] = useState<{
    row: NativeChatBranchRow
    findings: ConversationBranchFinding[]
    batchId: string
  } | null>(null)
  const [returning, setReturning] = useState<NativeChatBranchRow | null>(null)
  const ownBranch = providerSessionId ? conversationBranchOf(branches, providerSessionId) : null
  const surface = useMemo<NativeChatBranchSurface | undefined>(
    () =>
      supported && claudeWorktreeId
        ? {
            branchFrom: (row) => setRequest({ row, requestId: newAgentLaunchRequestId() }),
            branchFindings: (row, findings) =>
              setBatch({ row, findings, batchId: newAgentLaunchRequestId() }),
            ...(ownBranch ? { returnFrom: setReturning } : {}),
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
    [supported, claudeWorktreeId, branches, providerSessionId, session, guardSend, ownBranch]
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
      {batch && claudeWorktreeId ? (
        <ConversationBranchBatchDialog
          findings={batch.findings}
          onCancel={() => setBatch(null)}
          onCreate={(mode, items, onOutcome) =>
            startConversationBranchBatch(
              session.target,
              {
                worktreeId: claudeWorktreeId,
                source: { kind: 'chat', sessionId: session.sessionId, itemId: batch.row.messageId },
                mode,
                batchId: batch.batchId,
                items
              },
              onOutcome
            )
          }
        />
      ) : null}
      {returning && ownBranch && claudeWorktreeId ? (
        <ConversationBranchReturnDialog
          initialContent={conversationBranchReturnDraft(ownBranch.label, returning.markdown)}
          parentName={
            conversationBranchOf(branches, ownBranch.parent.providerSessionId)?.label ??
            translate('conversationBranch.originalInline', 'the original conversation')
          }
          onCancel={() => setReturning(null)}
          onReturn={async (content) => {
            await returnConversationBranchResult({
              target: session.target,
              worktreeId: claudeWorktreeId,
              branch: ownBranch,
              content
            })
            setReturning(null)
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
