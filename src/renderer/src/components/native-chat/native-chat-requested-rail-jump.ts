// A jump to a message asked for from outside its chat, e.g. "Back to branch point" in a branch.
// Held until a chat's rail lists the message, which may be only after the chat opens and its
// outline loads. Journal item ids are unique across chats, so the id alone picks the chat.

import { useEffect, useSyncExternalStore } from 'react'
import type { NativeChatRailItem } from './native-chat-message-rail-items'

let pending: string | null = null
const listeners = new Set<() => void>()

export function requestNativeChatRailJump(messageId: string): void {
  pending = messageId
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useNativeChatRequestedRailJump(
  items: readonly NativeChatRailItem[],
  select: (item: NativeChatRailItem) => void
): void {
  const requested = useSyncExternalStore(subscribe, () => pending)
  useEffect(() => {
    const item = requested ? items.find((candidate) => candidate.id === requested) : undefined
    if (!item) {
      return
    }
    pending = null
    select(item)
  }, [requested, items, select])
}
