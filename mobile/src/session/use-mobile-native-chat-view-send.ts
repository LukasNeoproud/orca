import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from 'react'
import type { FlatList } from 'react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'

export function useMobileNativeChatViewSend(args: {
  onSend: (text: string) => Promise<boolean>
  onClearSendError?: () => void
  listRef: RefObject<FlatList<NativeChatMessage> | null>
  setAtBottom: Dispatch<SetStateAction<boolean>>
}) {
  const { onSend, onClearSendError, listRef, setAtBottom } = args
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current)
      }
    },
    []
  )
  return useCallback(
    async (text: string): Promise<boolean> => {
      if (!(await onSend(text))) {
        return false
      }
      onClearSendError?.()
      setAtBottom(true)
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current)
      }
      scrollTimerRef.current = setTimeout(() => {
        scrollTimerRef.current = null
        listRef.current?.scrollToEnd({ animated: true })
      }, 60)
      return true
    },
    [listRef, onClearSendError, onSend, setAtBottom]
  )
}
