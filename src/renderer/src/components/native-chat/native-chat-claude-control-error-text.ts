import { translate } from '@/i18n/i18n'
import { isClaudeSessionNotRunning } from '@/runtime/claude-session-control-client'

/** Why a request to the chat's running Claude failed, in words a person can act on. */
export function claudeControlErrorText(error: unknown): string {
  if (isClaudeSessionNotRunning(error)) {
    return translate(
      'components.native-chat.claudeControls.notRunning',
      'Claude is not running in this chat yet. Send a message first.'
    )
  }
  return error instanceof Error ? error.message : String(error)
}
