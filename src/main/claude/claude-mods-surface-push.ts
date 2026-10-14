import {
  CLAUDE_MODS_PUSH_SUBTYPES,
  type ClaudeModsPane,
  type ClaudeModsPaneRoster,
  type ClaudeModsPushSubtype,
  type ClaudeModsSurfaceEvent
} from '../../shared/claude-mods-surface'

const PUSH_SUBTYPES: ReadonlySet<string> = new Set(CLAUDE_MODS_PUSH_SUBTYPES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

export function claudeModsPushSubtype(
  message: Record<string, unknown>
): ClaudeModsPushSubtype | null {
  if (message.type !== 'system' || typeof message.subtype !== 'string') {
    return null
  }
  return PUSH_SUBTYPES.has(message.subtype)
    ? // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: membership in PUSH_SUBTYPES was just checked.
      (message.subtype as ClaudeModsPushSubtype)
    : null
}

function readPane(value: unknown): ClaudeModsPane | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    return null
  }
  const rows = positiveInteger(value.rows)
  const columns = positiveInteger(value.columns)
  return {
    id: value.id,
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(typeof value.plugin === 'string' ? { plugin: value.plugin } : {}),
    ...(value.close_on_escape === true ? { close_on_escape: true } : {}),
    ...(value.hold_toasts === true ? { hold_toasts: true } : {}),
    ...(rows === undefined ? {} : { rows }),
    ...(columns === undefined ? {} : { columns })
  }
}

/** A `ui_panes` push or response, with anything malformed dropped rather than trusted. */
export function readClaudeModsPaneRoster(value: unknown): ClaudeModsPaneRoster | null {
  if (!isRecord(value) || !Array.isArray(value.panes)) {
    return null
  }
  const panes = value.panes.map(readPane).filter((pane): pane is ClaudeModsPane => pane !== null)
  const ids = new Set(panes.map((pane) => pane.id))
  const known = (id: string | null): string | null => (id !== null && ids.has(id) ? id : null)
  return {
    panes,
    shown_id: known(stringOrNull(value.shown_id)),
    focused_id: known(stringOrNull(value.focused_id)),
    focus_requested_id: known(stringOrNull(value.focus_requested_id))
  }
}

/** One CLI push as the renderer's event, or null for a frame too malformed to forward. */
export function claudeModsPushEvent(
  subtype: ClaudeModsPushSubtype,
  message: Record<string, unknown>
): ClaudeModsSurfaceEvent | null {
  const plugin = typeof message.plugin === 'string' ? message.plugin : ''
  switch (subtype) {
    case 'ui_invalidate': {
      const instances = Array.isArray(message.instances)
        ? message.instances.filter((id): id is string => typeof id === 'string')
        : undefined
      return { type: 'invalidate', ...(instances ? { instances } : {}) }
    }
    case 'ui_panes': {
      const roster = readClaudeModsPaneRoster(message)
      return roster ? { type: 'panes', roster } : null
    }
    case 'ui_toast': {
      const timeoutMs = positiveInteger(message.timeout_ms)
      return typeof message.text === 'string'
        ? {
            type: 'toast',
            plugin,
            text: message.text,
            ...(timeoutMs === undefined ? {} : { timeoutMs })
          }
        : null
    }
    case 'ui_status':
      return { type: 'status', plugin, text: stringOrNull(message.text) }
    case 'ui_log':
      return typeof message.text === 'string' ? { type: 'log', plugin, text: message.text } : null
    case 'ui_scroll':
    case 'ui_focus': {
      const { uuid: _uuid, session_id: _session, type: _type, ...push } = message
      return { type: subtype === 'ui_scroll' ? 'scroll' : 'focus', push }
    }
  }
}
