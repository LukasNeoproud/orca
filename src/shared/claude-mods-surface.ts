// Claude Code mods drawn in structured chat: the wire between Orca's host and its renderer.
// The CLI side (`ui_*` control requests and system pushes) is internal and unversioned; see
// docs/reference/claude-mods-surface-protocol.md for the shapes this relies on.

/** The `ui_*` control requests a renderer may ask the host to forward to the CLI. */
export const CLAUDE_MODS_REQUEST_SUBTYPES = [
  'ui_render',
  'ui_press',
  'ui_input',
  'ui_select',
  'ui_panes',
  'ui_pane_show',
  'ui_pane_focus',
  'ui_close',
  'ui_scroll',
  'ui_focus'
] as const

export type ClaudeModsRequestSubtype = (typeof CLAUDE_MODS_REQUEST_SUBTYPES)[number]

/** The pushes the CLI raises as `{ type: 'system', subtype }` frames for an attached surface. */
export const CLAUDE_MODS_PUSH_SUBTYPES = [
  'ui_invalidate',
  'ui_panes',
  'ui_toast',
  'ui_status',
  'ui_log',
  'ui_scroll',
  'ui_focus'
] as const

export type ClaudeModsPushSubtype = (typeof CLAUDE_MODS_PUSH_SUBTYPES)[number]

export type ClaudeModsPane = {
  id: string
  title?: string
  plugin?: string
  close_on_escape?: boolean
  hold_toasts?: boolean
  rows?: number
  columns?: number
}

export type ClaudeModsPaneRoster = {
  panes: ClaudeModsPane[]
  shown_id: string | null
  focused_id: string | null
  focus_requested_id: string | null
}

export const EMPTY_CLAUDE_MODS_PANE_ROSTER: ClaudeModsPaneRoster = {
  panes: [],
  shown_id: null,
  focused_id: null,
  focus_requested_id: null
}

/** Why mods draw nothing for a session, when they cannot. */
export type ClaudeModsUnavailableReason = 'no-connection' | 'unsupported-cli' | 'attach-failed'

export type ClaudeModsSurfaceEvent =
  | {
      /** Sent first and again whenever the session's child changes: the full picture. */
      type: 'state'
      available: boolean
      reason?: ClaudeModsUnavailableReason
      roster: ClaudeModsPaneRoster
      statuses: Record<string, string>
    }
  | { type: 'invalidate'; instances?: string[] }
  | { type: 'panes'; roster: ClaudeModsPaneRoster }
  | { type: 'toast'; plugin: string; text: string; timeoutMs?: number }
  | { type: 'status'; plugin: string; text: string | null }
  | { type: 'log'; plugin: string; text: string }
  | { type: 'scroll'; push: Record<string, unknown> }
  | { type: 'focus'; push: Record<string, unknown> }

/** The client id Orca attaches under; the CLI keeps the colon for its own `<surface>:default`. */
export const CLAUDE_MODS_CLIENT_ID = 'orca'

/** Orca draws as the Desktop app does: the table with Input, Select and Svg. */
export const CLAUDE_MODS_SURFACE = 'desktop'
