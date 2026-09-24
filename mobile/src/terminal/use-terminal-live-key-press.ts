import { useCallback, type RefObject } from 'react'
import { SPECIAL_KEY_LABELS } from './terminal-key-definitions'
import { buildPendingTerminalKey } from './terminal-pending-modifiers'
import { getTerminalLiveSpecialKeyDecision } from './terminal-live-text-commit'
import { sendTerminalLiveControlAfterPendingFlush } from './terminal-live-control-send-order'
import type { TerminalLiveInputSender } from './terminal-live-input-sender'

export type TerminalLiveInputKeyPressEvent = {
  readonly nativeEvent: { readonly key: string }
}

type Options = {
  activeHandle: string | null
  liveInputTerminalHandles: ReadonlySet<string>
  advanceLiveInputInteractionGeneration: () => void
  currentPendingModifiers: () => readonly import('./terminal-accessory-keys').TerminalShortcutModifier[]
  takePendingModifiers: () => import('./terminal-accessory-keys').TerminalShortcutModifier[]
  liveInputComposingRef: RefObject<boolean | undefined>
  captureTextRef: RefObject<string>
  suppressNativeEditRef: RefObject<string | null>
  flushPendingLiveInputText: (handle: string | null) => Promise<boolean>
  sendLiveTerminalInputRef: RefObject<TerminalLiveInputSender>
  onModifierFallback?: () => void
  pendingLiveInputHandleRef: RefObject<string | null>
  clearPendingLiveInputCommit: () => void
  heldLiveInputTextRef: RefObject<string>
  sentLiveInputTextRef: RefObject<string>
  waitForPendingLiveInputFlush: () => Promise<boolean>
}

export function useTerminalLiveKeyPress(options: Options) {
  const {
    activeHandle,
    liveInputTerminalHandles,
    advanceLiveInputInteractionGeneration,
    currentPendingModifiers,
    takePendingModifiers,
    liveInputComposingRef,
    captureTextRef,
    suppressNativeEditRef,
    flushPendingLiveInputText,
    sendLiveTerminalInputRef,
    onModifierFallback,
    pendingLiveInputHandleRef,
    clearPendingLiveInputCommit,
    heldLiveInputTextRef,
    sentLiveInputTextRef,
    waitForPendingLiveInputFlush
  } = options
  const handleLiveInputKeyPress = useCallback(
    (event: TerminalLiveInputKeyPressEvent) => {
      if (!activeHandle || !liveInputTerminalHandles.has(activeHandle)) {
        return
      }
      if (event.nativeEvent.key === 'Enter') {
        return
      }
      advanceLiveInputInteractionGeneration()
      if (currentPendingModifiers().length > 0 && liveInputComposingRef.current !== true) {
        const specialKey = event.nativeEvent.key
        const keyId =
          specialKey === 'Backspace'
            ? 'backspace'
            : specialKey === 'Delete'
              ? 'delete'
              : specialKey === 'Tab'
                ? 'tab'
                : specialKey === 'Escape' || specialKey === 'Esc'
                  ? 'escape'
                  : specialKey.startsWith('Arrow')
                    ? `arrow${specialKey.slice(5)}`
                    : specialKey.charAt(0).toLowerCase() + specialKey.slice(1)
        if (keyId in SPECIAL_KEY_LABELS) {
          const bytes = buildPendingTerminalKey(keyId, takePendingModifiers())
          if (bytes) {
            if (specialKey === 'Backspace' && captureTextRef.current.length > 0) {
              suppressNativeEditRef.current = captureTextRef.current
            }
            void sendTerminalLiveControlAfterPendingFlush(
              async () => {
                const flushed = await flushPendingLiveInputText(activeHandle)
                captureTextRef.current = ''
                return flushed
              },
              () => sendLiveTerminalInputRef.current(activeHandle, bytes)
            )
            return
          }
          onModifierFallback?.()
        }
      }
      const ownsPendingState = pendingLiveInputHandleRef.current === activeHandle
      if (pendingLiveInputHandleRef.current && !ownsPendingState) {
        clearPendingLiveInputCommit()
      }
      const decision = getTerminalLiveSpecialKeyDecision({
        key: event.nativeEvent.key,
        heldText: ownsPendingState ? heldLiveInputTextRef.current : '',
        sentText: ownsPendingState ? sentLiveInputTextRef.current : ''
      })
      switch (decision.kind) {
        case 'ignore':
        case 'local-edit':
          return
        case 'send-now':
          void sendTerminalLiveControlAfterPendingFlush(waitForPendingLiveInputFlush, () =>
            sendLiveTerminalInputRef.current(activeHandle, decision.bytes)
          )
          return
        case 'commit-held-then-send':
          void sendTerminalLiveControlAfterPendingFlush(
            () => flushPendingLiveInputText(activeHandle),
            () => sendLiveTerminalInputRef.current(activeHandle, decision.bytes)
          )
          return
        default:
          decision satisfies never
      }
    },
    [
      activeHandle,
      advanceLiveInputInteractionGeneration,
      clearPendingLiveInputCommit,
      currentPendingModifiers,
      flushPendingLiveInputText,
      liveInputTerminalHandles,
      liveInputComposingRef,
      onModifierFallback,
      sendLiveTerminalInputRef,
      takePendingModifiers,
      waitForPendingLiveInputFlush
    ]
  )

  return handleLiveInputKeyPress
}
