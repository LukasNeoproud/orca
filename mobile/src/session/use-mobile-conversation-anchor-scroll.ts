import { useEffect, type RefObject } from 'react'
import type { FlatList } from 'react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { MobileConversationAnchorRequest } from './mobile-conversation-anchor-request'

export function useMobileConversationAnchorScroll(args: {
  anchor: MobileConversationAnchorRequest | null | undefined
  data: readonly NativeChatMessage[]
  hasMore?: boolean
  loadingEarlier?: boolean
  listRef: RefObject<FlatList<NativeChatMessage> | null>
  onLoadEarlier?: () => void
  onConsumed?: (sequence: number) => void
}): void {
  const { anchor, data, hasMore, listRef, loadingEarlier, onConsumed, onLoadEarlier } = args
  useEffect(() => {
    if (!anchor) {
      return
    }
    const index = data.findIndex((message) => message.id === anchor.itemId)
    if (index === -1) {
      if (hasMore && !loadingEarlier) {
        onLoadEarlier?.()
      }
      return
    }
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true })
      onConsumed?.(anchor.sequence)
    }, 60)
    return () => clearTimeout(timer)
  }, [anchor, data, hasMore, listRef, loadingEarlier, onConsumed, onLoadEarlier])
}
