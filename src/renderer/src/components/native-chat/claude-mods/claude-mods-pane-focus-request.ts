// Whether the engine's `focus_requested_id` may take the keyboard now. After Claude Desktop: only
// while the person is not mid-input and no dialog is open. A press inside a mods site is not
// typing, and focus elsewhere in Orca (a terminal beside the chat) is never this chat's to take.

import { useEffect, useRef, useState } from 'react'
import type { ClaudeModsPaneRoster } from '../../../../../shared/claude-mods-surface'
import { CLAUDE_MODS_OWNER_ATTRIBUTE } from './claude-mods-layout-measure'
import { isClaudeModsTextField } from './claude-mods-focus-keyboard'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

export const CLAUDE_MODS_PANE_ATTRIBUTE = 'data-claude-mods-pane'

// Only open Radix layers: some Orca chrome keeps a role="dialog" element mounted.
const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

function hasText(field: HTMLElement): boolean {
  const text =
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? field.value
      : (field.textContent ?? '')
  return text.trim() !== ''
}

export function claudeModsFocusRequestAllowed(input: {
  active: Element | null
  /** The chat's own root: transcript, panes and composer. */
  chatRoot: Element | null
  /** The plugin of the pane that asks; typing in its own field does not hold it back. */
  plugin: string | undefined
}): boolean {
  const { active, chatRoot, plugin } = input
  const doc = chatRoot?.ownerDocument ?? active?.ownerDocument
  if (doc?.querySelector(OPEN_DIALOG)) {
    return false
  }
  if (!active || active === doc?.body || active === doc?.documentElement) {
    return true
  }
  if (chatRoot && !chatRoot.contains(active)) {
    return false
  }
  if (!(active instanceof HTMLElement) || !isClaudeModsTextField(active) || !hasText(active)) {
    return true
  }
  const owner = active.closest(`[${CLAUDE_MODS_OWNER_ATTRIBUTE}]`)
  return plugin !== undefined && owner?.getAttribute(CLAUDE_MODS_OWNER_ATTRIBUTE) === plugin
}

/** The pane that holds DOM focus, which a refused request reports back; null is the composer. */
export function claudeModsFocusedPane(active: Element | null): string | null {
  return (
    active?.closest(`[${CLAUDE_MODS_PANE_ATTRIBUTE}]`)?.getAttribute(CLAUDE_MODS_PANE_ATTRIBUTE) ??
    null
  )
}

/**
 * Judges a focus request for a pane that is not the shown one, once per request: honoured, it
 * shows that pane, whose body then takes the keyboard; refused, it reports the real holder.
 * Returns the pane a refused request left waiting, for the tab strip to mark.
 */
export function useClaudeModsPaneFocusRequest(
  controller: Pick<ClaudeModsSurfaceController, 'showPane' | 'focusPane'> | null,
  roster: ClaudeModsPaneRoster,
  shownId: string | null,
  chatRoot: () => Element | null
): string | null {
  const requested = roster.focus_requested_id
  const judged = useRef<string | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)
  const plugin = roster.panes.find((pane) => pane.id === requested)?.plugin
  const open = roster.panes.some((pane) => pane.id === requested)
  // A waiting pane stops waiting once it is shown, whoever showed it.
  const [lastShown, setLastShown] = useState(shownId)
  if (lastShown !== shownId) {
    setLastShown(shownId)
    if (waiting === shownId) {
      setWaiting(null)
    }
  }
  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- Why: the verdict reads DOM focus, which no render input carries.
  useEffect(() => {
    if (requested === null) {
      judged.current = null
      return
    }
    // The shown pane judges its own request once it has drawn.
    if (!controller || !open || requested === shownId || judged.current === requested) {
      return
    }
    judged.current = requested
    const active = document.activeElement
    if (claudeModsFocusRequestAllowed({ active, chatRoot: chatRoot(), plugin })) {
      controller.showPane(requested)
    } else {
      setWaiting(requested)
      controller.focusPane(claudeModsFocusedPane(active), true)
    }
  }, [controller, requested, open, shownId, plugin, chatRoot])
  return waiting !== null && roster.panes.some((pane) => pane.id === waiting) ? waiting : null
}
