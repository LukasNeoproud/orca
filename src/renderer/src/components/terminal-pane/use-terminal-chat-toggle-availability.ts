import { useCallback } from 'react'
import { canSwitchNativeChatView } from '../native-chat/native-chat-availability'

type Input = {
  chatLeafId: string | null
  effectiveChatViewMode: boolean
  isChatEligibleForLeaf: (leafId: string | null) => boolean
  nativeChatEnabled: boolean
  tabStructuredSessionId?: string | null
  structuredSessionLeafId?: string | null
  structuredSessionPaneKey?: string | null
  tabId: string
}

export function useTerminalChatToggleAvailability({
  chatLeafId,
  effectiveChatViewMode,
  isChatEligibleForLeaf,
  nativeChatEnabled,
  tabStructuredSessionId,
  structuredSessionLeafId,
  structuredSessionPaneKey,
  tabId
}: Input) {
  return useCallback(
    (leafId: string | null): boolean => {
      if (
        tabStructuredSessionId &&
        (!structuredSessionLeafId || structuredSessionLeafId === leafId)
      ) {
        return canSwitchNativeChatView({
          experimentalNativeChatEnabled: nativeChatEnabled,
          contentType: 'terminal',
          isChatViewMode: effectiveChatViewMode && chatLeafId === leafId,
          structuredSessionId: tabStructuredSessionId,
          structuredSessionPaneKey,
          activePaneKey: leafId ? `${tabId}:${leafId}` : null
        })
      }
      // Scope the "always allow toggling back" rule to the leaf showing chat; must not make an unsupported sibling look eligible.
      const isChatViewForLeaf = effectiveChatViewMode && leafId !== null && chatLeafId === leafId
      return (nativeChatEnabled && isChatViewForLeaf) || isChatEligibleForLeaf(leafId)
    },
    [
      chatLeafId,
      effectiveChatViewMode,
      isChatEligibleForLeaf,
      nativeChatEnabled,
      tabStructuredSessionId,
      structuredSessionLeafId,
      structuredSessionPaneKey,
      tabId
    ]
  )
}
