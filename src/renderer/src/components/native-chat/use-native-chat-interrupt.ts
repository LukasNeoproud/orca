import { useCallback } from 'react'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import type { NativeChatResolvedTarget } from './native-chat-composer-target'

const ESC = '\x1b'

export function useNativeChatInterrupt({
  cancelPendingSends,
  isWorking,
  onStop,
  resolveTarget
}: {
  cancelPendingSends: () => void
  isWorking: boolean
  onStop?: () => void
  resolveTarget: () => NativeChatResolvedTarget | null
}): () => void {
  return useCallback(() => {
    cancelPendingSends()
    if (isWorking && onStop) {
      onStop()
      return
    }
    const target = resolveTarget()
    if (target) {
      sendRuntimePtyInput(target.settings, target.ptyId, ESC)
    }
  }, [cancelPendingSends, isWorking, onStop, resolveTarget])
}
