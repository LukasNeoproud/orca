import { useCallback, useEffect, useRef, useState } from 'react'
import type { TerminalShortcutModifier } from './terminal-accessory-keys'
import { SPECIAL_KEY_LABELS } from './terminal-key-definitions'
import { buildPendingTerminalKey, toggleTerminalModifier } from './terminal-pending-modifiers'

type PendingModifierOptions = {
  activeHandle: string | null
  activeSessionTabType: string | null | undefined
  connected: boolean
  liveInputEnabled?: boolean
  onModifierFallback?: () => void
}

export function useTerminalPendingModifierState({
  activeHandle,
  activeSessionTabType,
  connected,
  liveInputEnabled,
  onModifierFallback
}: PendingModifierOptions) {
  const pendingIdentity = JSON.stringify([
    activeHandle,
    activeSessionTabType,
    connected,
    liveInputEnabled
  ])
  const [pendingState, setPendingState] = useState<{
    identity: string
    epoch: number
    modifiers: TerminalShortcutModifier[]
  }>({ identity: pendingIdentity, epoch: 0, modifiers: [] })
  const pendingModifiersRef = useRef<TerminalShortcutModifier[]>([])
  const pendingIdentityRef = useRef(pendingIdentity)
  const identityEpochRef = useRef(0)
  const pendingModifiers =
    pendingState.identity === pendingIdentity &&
    pendingState.epoch === identityEpochRef.current &&
    pendingIdentityRef.current === pendingIdentity
      ? pendingState.modifiers
      : []
  useEffect(() => {
    if (pendingIdentityRef.current !== pendingIdentity) {
      pendingModifiersRef.current = []
      pendingIdentityRef.current = pendingIdentity
      identityEpochRef.current += 1
    }
  }, [pendingIdentity])
  const currentPendingModifiers = useCallback(
    () => (pendingIdentityRef.current === pendingIdentity ? pendingModifiersRef.current : []),
    [pendingIdentity]
  )
  const clearPendingModifiers = useCallback(() => {
    if (pendingIdentityRef.current !== pendingIdentity) {
      identityEpochRef.current += 1
    }
    pendingModifiersRef.current = []
    pendingIdentityRef.current = pendingIdentity
    setPendingState({ identity: pendingIdentity, epoch: identityEpochRef.current, modifiers: [] })
  }, [pendingIdentity])
  const togglePendingModifier = useCallback(
    (modifier: TerminalShortcutModifier) => {
      const next = toggleTerminalModifier(currentPendingModifiers(), modifier)
      if (pendingIdentityRef.current !== pendingIdentity) {
        identityEpochRef.current += 1
      }
      pendingModifiersRef.current = next
      pendingIdentityRef.current = pendingIdentity
      setPendingState({
        identity: pendingIdentity,
        epoch: identityEpochRef.current,
        modifiers: next
      })
    },
    [currentPendingModifiers, pendingIdentity]
  )
  const takePendingModifiers = useCallback(() => {
    const current = currentPendingModifiers()
    clearPendingModifiers()
    return current
  }, [clearPendingModifiers, currentPendingModifiers])
  const consumePendingAccessoryKey = useCallback(
    (keyId: string, bytes: string) => {
      const pending = takePendingModifiers()
      if (pending.length === 0) {
        return bytes
      }
      if (!(keyId in SPECIAL_KEY_LABELS)) {
        return bytes
      }
      const composed = buildPendingTerminalKey(keyId, pending)
      if (composed === null) {
        onModifierFallback?.()
        return bytes
      }
      return composed
    },
    [onModifierFallback, takePendingModifiers]
  )
  return {
    pendingModifiers,
    currentPendingModifiers,
    clearPendingModifiers,
    togglePendingModifier,
    takePendingModifiers,
    consumePendingAccessoryKey
  }
}
