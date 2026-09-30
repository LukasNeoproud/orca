import { useImperativeHandle, type ForwardedRef } from 'react'
import type { NativeChatComposerHandle } from './native-chat-composer-types'

export function useNativeChatComposerHandle(
  ref: ForwardedRef<NativeChatComposerHandle>,
  handle: {
    focus: () => boolean
    insertTypedText: (text: string) => boolean
    addResponseComment: (quote: string, comment: string) => boolean
    handlePasteEvent: (event: {
      clipboardData: DataTransfer | null
      preventDefault: () => void
      defaultPrevented: boolean
    }) => void
    pasteFromClipboard: () => void
  }
): void {
  useImperativeHandle(ref, () => handle, [handle])
}
