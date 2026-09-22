import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../shared/tui-agent'
import { useAppStore } from '@/store'

export async function waitForTerminalProviderSession(
  paneKey: string | undefined,
  timeoutMs = 15_000,
  expected?: { agent: TuiAgent; workspaceId: string; ptyId: string }
) {
  const read = () => {
    const state = useAppStore.getState()
    const status = paneKey ? state.agentStatusByPaneKey[paneKey] : undefined
    if (expected) {
      const pane = paneKey ? parsePaneKey(paneKey) : null
      if (
        !pane ||
        status?.agentType !== expected.agent ||
        status.worktreeId !== expected.workspaceId ||
        state.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId] !== expected.ptyId
      ) {
        return undefined
      }
    }
    return status?.providerSession
  }
  const current = read()
  if (current) {
    return current
  }
  return new Promise<ReturnType<typeof read>>((resolve) => {
    const timer = setTimeout(() => finish(undefined), timeoutMs)
    const unsubscribe = useAppStore.subscribe(() => {
      const providerSession = read()
      if (providerSession) {
        finish(providerSession)
      }
    })
    const finish = (providerSession: ReturnType<typeof read>): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve(providerSession)
    }
  })
}
