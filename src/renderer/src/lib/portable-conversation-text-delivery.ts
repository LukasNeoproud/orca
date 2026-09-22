import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { PortableConversationSource } from '../../../shared/portable-conversation-source'
import { readPortableConversationSession } from './portable-conversation-source-client'
import { findPortableConversationTerminalTarget } from './portable-conversation-terminal-target'
import {
  activeAgentNotesSendFailureMessage,
  sendNotesToActiveAgentSession
} from './active-agent-note-send'

/** Called only after the owning runtime durably claims this immutable message. */
export async function deliverPortableConversationText(
  target: RuntimeClientTarget,
  source: PortableConversationSource,
  content: string
): Promise<{ status: 'unknown' | 'rejected'; reason: string }> {
  let sendAttempted = false
  try {
    await readPortableConversationSession(target, source)
    const noteTarget = findPortableConversationTerminalTarget(target, source)
    if (!noteTarget) {
      throw new Error(
        'The parent conversation has no verified terminal. Open it from history, then retry this saved message.'
      )
    }
    sendAttempted = true
    const sent = await sendNotesToActiveAgentSession({
      worktreeId: source.workspace.id,
      runtimeTarget: target,
      expectedExecutionHostId: source.executionHostId,
      preserveWhitespace: true,
      noteTarget,
      prompt: content
    })
    return {
      status:
        sent.status === 'permission' ||
        sent.status === 'no-agent' ||
        sent.status === 'empty' ||
        sent.status === 'not-ready' ||
        sent.status === 'not-writable'
          ? 'rejected'
          : 'unknown',
      reason:
        sent.status === 'sent'
          ? 'Terminal input was written; agent acceptance is unverified.'
          : activeAgentNotesSendFailureMessage(sent.status, {
              explicitTarget: true,
              code: sent.code
            })
    }
  } catch (failure) {
    return {
      status: sendAttempted ? 'unknown' : 'rejected',
      reason: failure instanceof Error ? failure.message : String(failure)
    }
  }
}
