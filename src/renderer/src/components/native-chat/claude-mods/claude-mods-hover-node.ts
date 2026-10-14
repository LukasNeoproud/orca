// Pointer tracking for a node that takes part in hover: a keyed Box (a context for what is
// beneath it), a member of a hover group, or an element a hover override is drawn on.

import { createContext, useContext, useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { useClaudeModsDrawScope } from './claude-mods-draw-scope'
import {
  claudeModsBoxHoverId,
  claudeModsGroupHoverId,
  isClaudeModsHoverKey
} from './claude-mods-hover-store'
import { claudeModsHoverScope, type ClaudeModsHover } from './claude-mods-hover-style'

/** The nearest keyed Box above, by its hover id; null outside one. */
export const ClaudeModsHoverBoxContext = createContext<string | null>(null)

const noopSubscribe = (): (() => void) => () => {}

export type ClaudeModsHoverNode = {
  lit: boolean
  /** The hover id of the context this node's children sit in. */
  contextId: string | null
  pointerHandlers: { onPointerEnter: () => void; onPointerLeave: () => void } | undefined
}

export function useClaudeModsHoverNode(input: {
  /** The Box's own `key` when this node is a Box. */
  boxKey?: unknown
  hover: ClaudeModsHover | undefined
  /** `group.plugin` for Box and Text, `press.plugin` for a Button. */
  owner: string | undefined
}): ClaudeModsHoverNode {
  const store = useClaudeModsDrawScope()?.controller.hover ?? null
  const instance = useId()
  const parent = useContext(ClaudeModsHoverBoxContext)
  const contextId = isClaudeModsHoverKey(input.boxKey) ? claudeModsBoxHoverId(instance) : parent
  const scope = claudeModsHoverScope(input.hover)
  const groupId = scope && input.owner ? claudeModsGroupHoverId(input.owner, scope) : null
  const hasHover = input.hover !== undefined
  const lit = useSyncExternalStore(store && hasHover ? store.subscribe : noopSubscribe, () =>
    store && hasHover ? store.isLit(contextId, groupId) : false
  )
  const entered = useRef<string[]>([])
  useEffect(
    () => () => {
      store?.leave(entered.current)
      entered.current = []
    },
    [store]
  )
  const own = [contextId !== parent ? contextId : null, groupId].filter(
    (id): id is string => id !== null
  )
  return {
    lit,
    contextId,
    pointerHandlers:
      store && own.length > 0
        ? {
            onPointerEnter: () => {
              entered.current = own
              store.enter(own)
            },
            onPointerLeave: () => {
              store.leave(entered.current)
              entered.current = []
            }
          }
        : undefined
  }
}
