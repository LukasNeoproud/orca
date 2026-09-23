import type { MobileChatPermission } from './mobile-native-chat-permission'
import type { MobileChatQuestion } from './mobile-native-chat-question'
import type { useMobileStructuredAgentSession } from './use-mobile-structured-agent-session'

export function projectMobileStructuredChatState(
  structured: boolean,
  session: ReturnType<typeof useMobileStructuredAgentSession>,
  legacyPermission: MobileChatPermission | null,
  legacyQuestion: MobileChatQuestion | null
) {
  return {
    nativeChatCodexUsage: structured ? (session.codexUsage ?? null) : null,
    nativeChatBackgroundTasks: structured ? session.backgroundTasks : null,
    canStopNativeChatBackgroundTasks: structured && session.canStopBackgroundTasks,
    stopNativeChatBackgroundTask: session.stopBackgroundTask,
    nativeChatPermission: structured ? session.permission : legacyPermission,
    nativeChatQuestion: structured ? session.question : legacyQuestion
  }
}
