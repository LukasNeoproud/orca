import { useEffect, useRef, type RefObject } from 'react'
import type {
  SessionOptionDescriptor,
  SessionOptionValue
} from '../../../../shared/native-chat-session-options'

/**
 * Shift+Tab in this chat's message box steps to the next permission mode, as it does in Claude's
 * terminal. Scoped to the composer holding `anchor`, so another chat's box is left alone, and off
 * for an agent with no mode to pick: there Shift+Tab keeps moving focus back.
 */
export function useNativeChatPermissionModeCycle(args: {
  anchor: RefObject<HTMLElement | null>
  mode: SessionOptionDescriptor | undefined
  disabled: boolean
  setMode: (descriptor: SessionOptionDescriptor, value: SessionOptionValue) => void
}): void {
  const latest = useRef(args)
  latest.current = args
  const cycles =
    args.mode?.id === 'permissionMode' && args.mode.kind.type === 'select' && args.mode.settable
  useEffect(() => {
    if (!cycles) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const { anchor, mode, disabled, setMode } = latest.current
      const target = event.target
      if (
        event.key !== 'Tab' ||
        !event.shiftKey ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.isComposing ||
        !(target instanceof HTMLElement) ||
        !(target.isContentEditable || target instanceof HTMLTextAreaElement) ||
        !mode ||
        mode.kind.type !== 'select'
      ) {
        return
      }
      const composer = anchor.current?.closest('[data-native-chat-composer-shell]')
      if (!composer?.contains(target)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const { choices, currentValue } = mode.kind
      if (disabled || choices.length < 2) {
        return
      }
      const index = choices.findIndex((choice) => choice.value === currentValue)
      const next = choices[(index + 1) % choices.length]
      if (next) {
        setMode(mode, next.value)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [cycles])
}
