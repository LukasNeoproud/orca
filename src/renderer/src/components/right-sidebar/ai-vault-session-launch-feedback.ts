import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { hasRuntimeRpcErrorCode } from '../../../../shared/runtime-rpc-error-code'
import {
  aiVaultResumeUnsupportedMessage,
  resolveAiVaultSessionLaunchTarget
} from './ai-vault-session-launch-target'

/** The host refuses an adoption whose conversation another chat already holds, and refuses one it
 *  cannot find under any account home it recognises. Both are actionable, and neither is the
 *  generic "could not prepare" the terminal resume reports. */
export function notifyAiVaultSessionResumeInChatFailure(error: unknown): void {
  if (hasRuntimeRpcErrorCode(error, 'agent_session_conflict')) {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.resumeInChatConflict',
        'Another chat is already holding this conversation.'
      )
    )
    return
  }
  if (hasRuntimeRpcErrorCode(error, 'agent_session_identity_required')) {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.resumeInChatTranscriptMissing',
        "This conversation's history could not be loaded, so it cannot be resumed in chat."
      )
    )
    return
  }
  toast.error(
    translate(
      'auto.components.right.sidebar.AiVaultPanel.resumeInChatFailed',
      'Could not resume this session in a new chat.'
    )
  )
}

export function notifyAiVaultSessionPreparationFailure(error: unknown): void {
  toast.error(
    error instanceof Error
      ? error.message
      : translate(
          'auto.components.right.sidebar.AiVaultPanel.prepareSessionResumeFailed',
          'Could not prepare this session for resume.'
        )
  )
}

export function resolveAiVaultSessionLaunchTargetOrNotify(
  args: Parameters<typeof resolveAiVaultSessionLaunchTarget>[0]
): Extract<ReturnType<typeof resolveAiVaultSessionLaunchTarget>, { status: 'ready' }> | null {
  const target = resolveAiVaultSessionLaunchTarget(args)
  if (target.status === 'missing') {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.openWorkspaceBeforeResuming',
        'Open a workspace before resuming a session.'
      )
    )
    return null
  }
  if (target.status === 'unsupported') {
    toast.error(aiVaultResumeUnsupportedMessage(target.targetStatus))
    return null
  }
  return target
}
