import { setWithLRU } from '@/lib/scroll-cache'

export type NativeChatMessageListViewState = {
  scrollTop: number
  stuckToBottom: boolean
  expandedTurnIds: string[]
}

const messageListViewState = new Map<string, NativeChatMessageListViewState>()

export function readNativeChatMessageListViewState(
  key: string | undefined
): NativeChatMessageListViewState | null {
  return key ? (messageListViewState.get(key) ?? null) : null
}

export function writeNativeChatMessageListViewState(
  key: string | undefined,
  state: NativeChatMessageListViewState
): void {
  if (key) {
    setWithLRU(messageListViewState, key, state)
  }
}
