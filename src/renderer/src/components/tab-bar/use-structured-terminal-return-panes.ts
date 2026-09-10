import { useShallow } from 'zustand/react/shallow'
import type { Tab } from '../../../../shared/tab-types'
import { useAppStore } from '../../store'
import { resolveNativeChatActiveLayoutLeafId } from '../native-chat/native-chat-leaf-routing'

export function useStructuredTerminalReturnPanes(tabs: readonly Tab[]): Record<string, string> {
  return useAppStore(
    useShallow((state) =>
      Object.fromEntries(
        tabs.flatMap((tab) => {
          if (!tab.structuredSessionId || !tab.structuredSessionPaneKey) {
            return []
          }
          const leafId = resolveNativeChatActiveLayoutLeafId(
            state.terminalLayoutsByTabId[tab.entityId]
          )
          return leafId ? [[tab.entityId, `${tab.entityId}:${leafId}`]] : []
        })
      )
    )
  )
}
