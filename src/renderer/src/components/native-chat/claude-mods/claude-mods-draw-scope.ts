import { createContext, useContext, type ReactNode } from 'react'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import type { ClaudeModsPress } from './claude-mods-tree'

/** Where a drawn control's press, typing and pick go. */
export type ClaudeModsDispatch = {
  press: (press: ClaudeModsPress, key: string | undefined, href?: string) => void
  input: (
    press: ClaudeModsPress,
    key: string | undefined,
    kind: 'change' | 'submit',
    value: string
  ) => Promise<void>
  select: (press: ClaudeModsPress, key: string | undefined, value: string) => void
}

export type ClaudeModsDrawScope = {
  controller: ClaudeModsSurfaceController
  /** The render site the tree was drawn for: `Pane`, `AbovePrompt` or a transcript component. */
  component: string
  instanceId: string
  /** Whether the site was opened asking for the keyboard; `autoFocus` honours only that. */
  focusRequested: boolean
  /** Overrides the controller's routing, e.g. a `Client` region whose handlers live in its frame. */
  dispatch?: ClaudeModsDispatch
  /** Draws core's own component where the tree holds `{type:'engine', ref}`; absent draws nothing. */
  renderEngine?: (ref: number) => ReactNode
}

export const ClaudeModsDrawContext = createContext<ClaudeModsDrawScope | null>(null)

export function useClaudeModsDrawScope(): ClaudeModsDrawScope | null {
  return useContext(ClaudeModsDrawContext)
}

/** The scope's routing: its own override, else the controller under the scope's site. */
export function claudeModsDispatch(scope: ClaudeModsDrawScope): ClaudeModsDispatch {
  if (scope.dispatch) {
    return scope.dispatch
  }
  const { controller, component, instanceId } = scope
  return {
    press: (press, key, href) => controller.press(instanceId, press, key, href),
    input: (press, key, kind, value) =>
      controller.input(instanceId, press, key, kind, value, component),
    select: (press, key, value) => controller.select(instanceId, press, key, value, component)
  }
}
