import { conversationBranchError } from '@/lib/conversation-branch-error'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  AgentSessionBranchesResult,
  AgentSessionBranchRecord
} from '../../../../shared/agent-session-branch'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  previewConversationBranch,
  readConversationFamily,
  callConversationBranch
} from '@/lib/structured-conversation-branch-client'
import {
  conversationLocationRoute,
  conversationViewKey,
  navigateRelatedConversation
} from '@/lib/conversation-family-navigation'
import { conversationDeliveryEnvelope } from '@/lib/conversation-branch-delivery'
import type { ConversationBranchSelection } from './conversation-branch-draft'
import { structuredSessionOperationId } from './use-structured-agent-session-outbox'

export function useConversationFamily(
  target: RuntimeClientTarget,
  sessionId: string,
  epoch: string | null | undefined,
  visible: boolean
) {
  const [family, setFamily] = useState<AgentSessionBranchesResult>({ branches: [], returns: [] })
  const scope = conversationViewKey(target, sessionId)
  const [familyScope, setFamilyScope] = useState<string | null>(null)
  const [selection, setSelection] = useState<ConversationBranchSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const inFlight = useRef(false)
  const startIds = useRef(new Map<string, string>())
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    if (!visible) {
      return
    }
    let current = true
    void readConversationFamily(target, sessionId)
      .then((result) => {
        if (current) {
          setFamily(result)
          setFamilyScope(scope)
          setError(null)
        }
      })
      .catch((failure) => {
        if (current) {
          setError(conversationBranchError(failure))
        }
      })
    return () => {
      current = false
    }
  }, [target, sessionId, visible, revision, scope])
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    setActionError(null)
    try {
      await action()
    } catch (failure) {
      setActionError(conversationBranchError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const branchMessage = (message: NativeChatMessage, selectedText?: string): void => {
    void run(async () => {
      if (!epoch) {
        throw new Error('The source conversation checkpoint is unavailable.')
      }
      const preview = await previewConversationBranch(target, {
        sourceSessionId: sessionId,
        expectedEpoch: epoch,
        sourceItemId: message.id
      })
      setSelection({
        sourceSessionId: sessionId,
        epoch,
        itemId: message.id,
        text: message.blocks
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('\n\n'),
        ...(selectedText ? { selectedText } : {}),
        agent: preview.sourceAgent,
        target,
        route: conversationLocationRoute(target, preview.sourceLocation)
      })
    })
  }
  const navigate = (branch: AgentSessionBranchRecord, source: boolean): void => {
    void run(() =>
      navigateRelatedConversation(
        target,
        source ? branch.source.sessionId : branch.target.sessionId,
        source ? branch.source.location : branch.target.location,
        source ? branch.source.anchor : undefined
      )
    )
  }
  const start = (branch: AgentSessionBranchRecord): void => {
    void run(async () => {
      const operationId =
        branch.delivery?.clientMessageId ??
        startIds.current.get(branch.branchId) ??
        structuredSessionOperationId()
      startIds.current.set(branch.branchId, operationId)
      const envelope = await conversationDeliveryEnvelope(
        target,
        branch.target.sessionId,
        operationId,
        branch.handoff.content
      )
      await callConversationBranch(target, 'agentSession.branchStart', {
        branchId: branch.branchId,
        envelope,
        ...(branch.delivery?.status === 'unknown' ? { retryUnknown: true } : {})
      })
      refresh()
    })
  }
  return {
    family: familyScope === scope ? family : { branches: [], returns: [] },
    selection:
      selection && conversationViewKey(selection.target, selection.sourceSessionId) === scope
        ? selection
        : null,
    closeSelection: () => {
      setSelection(null)
      refresh()
    },
    branchMessage,
    refresh,
    navigate,
    start,
    error: actionError ?? error,
    actionError,
    busy
  }
}
