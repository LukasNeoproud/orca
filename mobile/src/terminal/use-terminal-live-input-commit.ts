import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { TextInput } from 'react-native'
import type { TerminalShortcutModifier } from './terminal-accessory-keys'
import { useTerminalPendingModifierState } from './use-terminal-pending-modifier-state'
import {
  useTerminalLiveKeyPress,
  type TerminalLiveInputKeyPressEvent
} from './use-terminal-live-key-press'
import { appendedTerminalCharacter, buildPendingTerminalKey } from './terminal-pending-modifiers'
import { reportedLiveInputComposing } from '../platform/live-input-composing-range'
import { sendTerminalLiveControlAfterPendingFlush } from './terminal-live-control-send-order'
import type { TerminalLiveAccessoryInput } from './terminal-live-accessory-input'
import type { TerminalLiveInputSender } from './terminal-live-input-sender'
import { normalizeTerminalTextInput } from './terminal-text-input-normalization'
import { useTerminalLivePendingInputFlush } from './use-terminal-live-pending-input-flush'
import {
  useTerminalLiveAccessoryInputCommit,
  type TerminalLiveAccessoryInputCommitResult
} from './use-terminal-live-accessory-input-commit'

/** `isComposing` is the text system's marked-text range, forwarded by the pinned
 *  react-native patch on iOS; `onChangeText` would drop the payload entirely.
 *  Absent means the platform reports no range — not "not composing". */
type TerminalLiveInputChangeEvent = {
  readonly nativeEvent: {
    readonly text: string
    readonly isComposing?: boolean
  }
}

type TerminalLiveInputCommitOptions<TTabType extends string> = {
  readonly activeHandle: string | null
  readonly activeHandleRef: RefObject<string | null>
  readonly activeSessionTabType: TTabType | null | undefined
  readonly activeSessionTabTypeRef: RefObject<TTabType | null>
  readonly connected: boolean
  readonly liveInputRef: RefObject<TextInput | null>
  readonly liveInputCapture?: string
  readonly liveInputTerminalHandles: ReadonlySet<string>
  readonly liveInputEnabled?: boolean
  readonly liveInputTerminalHandlesRef: RefObject<Set<string>>
  readonly sendLiveTerminalInputRef: RefObject<TerminalLiveInputSender>
  readonly setLiveInputCapture: (text: string) => void
  readonly onModifierFallback?: () => void
}

type TerminalLiveInputCommitHandlers = {
  readonly clearPendingLiveInputCommit: () => void
  readonly flushPendingLiveInputBeforeExternalSend: (handle: string) => Promise<boolean>
  readonly getLiveInputInteractionGeneration: () => number
  readonly handleLiveInputAccessoryBytes: (
    input: TerminalLiveAccessoryInput
  ) => Promise<TerminalLiveAccessoryInputCommitResult>
  readonly handleLiveInputChange: (event: TerminalLiveInputChangeEvent) => void
  readonly handleLiveInputKeyPress: (event: TerminalLiveInputKeyPressEvent) => void
  readonly handleLiveInputSubmit: () => Promise<boolean>
  readonly pendingModifiers: readonly TerminalShortcutModifier[]
  readonly togglePendingModifier: (modifier: TerminalShortcutModifier) => void
  readonly consumePendingAccessoryKey: (keyId: string, bytes: string) => string
  readonly clearPendingModifiers: () => void
}

export function useTerminalLiveInputCommit<TTabType extends string>({
  activeHandle,
  activeHandleRef,
  activeSessionTabType,
  activeSessionTabTypeRef,
  connected,
  liveInputRef,
  liveInputCapture,
  liveInputTerminalHandles,
  liveInputEnabled,
  liveInputTerminalHandlesRef,
  sendLiveTerminalInputRef,
  setLiveInputCapture,
  onModifierFallback
}: TerminalLiveInputCommitOptions<TTabType>): TerminalLiveInputCommitHandlers {
  const {
    pendingModifiers,
    currentPendingModifiers,
    clearPendingModifiers,
    togglePendingModifier,
    takePendingModifiers,
    consumePendingAccessoryKey
  } = useTerminalPendingModifierState({
    activeHandle,
    activeSessionTabType,
    connected,
    liveInputEnabled,
    onModifierFallback
  })
  const captureTextRef = useRef('')
  useEffect(() => {
    if (liveInputCapture !== undefined) {
      captureTextRef.current = liveInputCapture
    }
  }, [liveInputCapture])
  const suppressNativeEditRef = useRef<string | null>(null)
  const liveInputInteractionGenerationRef = useRef(0)
  const advanceLiveInputInteractionGeneration = useCallback(() => {
    liveInputInteractionGenerationRef.current += 1
  }, [])
  const {
    applyLiveInputMirror,
    clearPendingLiveInputCommit,
    flushPendingLiveInputText,
    heldLiveInputTextRef,
    liveInputComposingRef,
    pendingLiveInputHandleRef,
    sentLiveInputTextRef,
    waitForPendingLiveInputFlush
  } = useTerminalLivePendingInputFlush({
    activeHandleRef,
    activeSessionTabTypeRef,
    liveInputRef,
    liveInputTerminalHandlesRef,
    sendLiveTerminalInputRef,
    setLiveInputCapture
  })

  useEffect(() => {
    // Why: what reached the PTY is unknowable across an outage — stale mirror state corrupts the first post-reconnect send.
    if (!connected) {
      clearPendingLiveInputCommit()
    }
  }, [connected, clearPendingLiveInputCommit])

  useEffect(() => {
    const pendingHandle = pendingLiveInputHandleRef.current
    if (!pendingHandle) {
      return
    }
    // Why: a lagging mobile tab list briefly yields no active tab object; a
    // null/undefined type is "unknown", not "left the terminal" — flush guards
    // still block sends if the tab truly changed.
    if (
      !activeHandle ||
      pendingHandle !== activeHandle ||
      (activeSessionTabType != null && activeSessionTabType !== 'terminal') ||
      !liveInputTerminalHandles.has(activeHandle)
    ) {
      clearPendingLiveInputCommit()
    }
  }, [activeHandle, activeSessionTabType, clearPendingLiveInputCommit, liveInputTerminalHandles])

  const flushPendingLiveInputBeforeExternalSend = useCallback(
    async (handle: string): Promise<boolean> => {
      advanceLiveInputInteractionGeneration()
      const pendingHandle = pendingLiveInputHandleRef.current
      if (pendingHandle && pendingHandle !== handle) {
        clearPendingLiveInputCommit()
        return waitForPendingLiveInputFlush()
      }
      // Why: external bytes (dictation/paste) land after the field's echo on the
      // PTY; the field session must fully end or later diffs would erase them.
      if (pendingHandle === handle) {
        return flushPendingLiveInputText(handle)
      }
      return waitForPendingLiveInputFlush()
    },
    [
      advanceLiveInputInteractionGeneration,
      clearPendingLiveInputCommit,
      flushPendingLiveInputText,
      waitForPendingLiveInputFlush
    ]
  )

  const handleLiveInputChange = useCallback(
    ({ nativeEvent }: TerminalLiveInputChangeEvent) => {
      if (!activeHandle || !liveInputTerminalHandles.has(activeHandle)) {
        clearPendingLiveInputCommit()
        return
      }
      // Why: iOS kills an active dictation/IME session when JS writes a value
      // that differs from the native field text, so the controlled capture must
      // echo the field verbatim; only the PTY mirror sees normalized text.
      advanceLiveInputInteractionGeneration()
      const wasComposing = liveInputComposingRef.current === true
      const previous = wasComposing ? sentLiveInputTextRef.current : captureTextRef.current
      captureTextRef.current = nativeEvent.text
      const suppressedPrevious = suppressNativeEditRef.current
      suppressNativeEditRef.current = null
      if (
        suppressedPrevious !== null &&
        nativeEvent.text === Array.from(suppressedPrevious).slice(0, -1).join('')
      ) {
        captureTextRef.current = ''
        setLiveInputCapture('')
        liveInputRef.current?.setNativeProps({ text: '' })
        return
      }
      if (currentPendingModifiers().length > 0 && nativeEvent.isComposing !== true) {
        const character = appendedTerminalCharacter(previous, nativeEvent.text)
        const bytes =
          nativeEvent.isComposing === false && character
            ? buildPendingTerminalKey(character, currentPendingModifiers())
            : null
        takePendingModifiers()
        if (bytes !== null) {
          if (wasComposing) {
            // Remove intercepted preedit before flushing the text that preceded it.
            void applyLiveInputMirror(activeHandle, previous, false)
          }
          captureTextRef.current = ''
          setLiveInputCapture(previous)
          liveInputRef.current?.setNativeProps({ text: previous })
          void sendTerminalLiveControlAfterPendingFlush(
            () => flushPendingLiveInputText(activeHandle),
            () => sendLiveTerminalInputRef.current(activeHandle, bytes)
          )
          return
        }
        onModifierFallback?.()
      }
      setLiveInputCapture(nativeEvent.text)
      void applyLiveInputMirror(
        activeHandle,
        normalizeTerminalTextInput(nativeEvent.text),
        reportedLiveInputComposing(nativeEvent.isComposing)
      )
    },
    [
      activeHandle,
      advanceLiveInputInteractionGeneration,
      applyLiveInputMirror,
      clearPendingLiveInputCommit,
      currentPendingModifiers,
      flushPendingLiveInputText,
      liveInputRef,
      liveInputTerminalHandles,
      onModifierFallback,
      sendLiveTerminalInputRef,
      setLiveInputCapture,
      takePendingModifiers
    ]
  )

  const getLiveInputInteractionGeneration = useCallback(
    () => liveInputInteractionGenerationRef.current,
    []
  )

  const handleLiveInputKeyPress = useTerminalLiveKeyPress({
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
  })

  const handleLiveInputAccessoryBytes = useTerminalLiveAccessoryInputCommit({
    activeHandle,
    applyLiveInputMirror,
    captureTextRef,
    clearPendingLiveInputCommit,
    flushPendingLiveInputText,
    heldLiveInputTextRef,
    liveInputComposingRef,
    liveInputRef,
    liveInputTerminalHandles,
    onInteraction: advanceLiveInputInteractionGeneration,
    pendingLiveInputHandleRef,
    sentLiveInputTextRef,
    sendLiveTerminalInputRef,
    setLiveInputCapture,
    waitForPendingLiveInputFlush
  })

  const handleLiveInputSubmit = useCallback((): Promise<boolean> => {
    if (!activeHandle || !liveInputTerminalHandles.has(activeHandle)) {
      return Promise.resolve(false)
    }
    advanceLiveInputInteractionGeneration()
    captureTextRef.current = ''
    const pending = takePendingModifiers()
    const bytes = pending.length > 0 ? (buildPendingTerminalKey('enter', pending) ?? '\r') : '\r'
    return sendTerminalLiveControlAfterPendingFlush(
      () => flushPendingLiveInputText(activeHandle),
      () => sendLiveTerminalInputRef.current(activeHandle, bytes)
    )
  }, [
    activeHandle,
    advanceLiveInputInteractionGeneration,
    flushPendingLiveInputText,
    liveInputTerminalHandles,
    sendLiveTerminalInputRef,
    takePendingModifiers
  ])

  return {
    clearPendingLiveInputCommit,
    flushPendingLiveInputBeforeExternalSend,
    getLiveInputInteractionGeneration,
    handleLiveInputAccessoryBytes,
    handleLiveInputChange,
    handleLiveInputKeyPress,
    handleLiveInputSubmit,
    pendingModifiers,
    togglePendingModifier,
    consumePendingAccessoryKey,
    clearPendingModifiers
  }
}
