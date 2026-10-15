// Claude Code mods' engine → client asks: the CLI asks the attached surface to copy text or to
// read, fill or suggest into its composer. See docs/reference/claude-mods-surface-protocol.md.

/** The asks Orca answers, named under `answers` on `ui_attach` while a composer listens. */
export const CLAUDE_MODS_ASK_SUBTYPES = [
  'ui_copy',
  'ui_prompt_read',
  'ui_prompt_fill',
  'ui_prompt_suggest'
] as const

export type ClaudeModsAskSubtype = (typeof CLAUDE_MODS_ASK_SUBTYPES)[number]

export type ClaudeModsFillMode = 'replace' | 'append' | 'insert'

/** Under the CLI's 1,000,000 so an ask or a read fits one 1 MiB RPC frame even as 3-byte UTF-8;
 *  past it the ask is answered with its default, as Desktop answers an oversized read. */
export const MAX_CLAUDE_MODS_ASK_TEXT = 300_000

/** An ask as the host hands it to the renderer; `id` is the host's, not the CLI's request id. */
export type ClaudeModsAsk =
  | { id: string; subtype: 'ui_copy'; text: string }
  | { id: string; subtype: 'ui_prompt_read' }
  | {
      id: string
      subtype: 'ui_prompt_fill'
      text: string
      mode: ClaudeModsFillMode
    }
  | { id: string; subtype: 'ui_prompt_suggest'; text: string }

export type ClaudeModsAskAnswer =
  | { copied: boolean }
  | { text: string; cursor: number }
  | { filled: boolean }
  | { shown: boolean }

const ASK_SUBTYPES: ReadonlySet<string> = new Set(CLAUDE_MODS_ASK_SUBTYPES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isClaudeModsAskSubtype(value: unknown): value is ClaudeModsAskSubtype {
  return typeof value === 'string' && ASK_SUBTYPES.has(value)
}

function readFillMode(value: unknown): ClaudeModsFillMode | null {
  if (value === undefined) {
    return 'replace'
  }
  return value === 'replace' || value === 'append' || value === 'insert' ? value : null
}

/** A CLI control request body as an ask, or null when it is not one Orca answers. */
export function readClaudeModsAsk(id: string, request: unknown): ClaudeModsAsk | null {
  if (!isRecord(request) || !isClaudeModsAskSubtype(request.subtype)) {
    return null
  }
  if (request.subtype === 'ui_prompt_read') {
    return { id, subtype: 'ui_prompt_read' }
  }
  const text = request.text
  if (typeof text !== 'string' || text.length > MAX_CLAUDE_MODS_ASK_TEXT) {
    return null
  }
  if (request.subtype === 'ui_prompt_fill') {
    const mode = readFillMode(request.mode)
    return mode ? { id, subtype: 'ui_prompt_fill', text, mode } : null
  }
  return { id, subtype: request.subtype, text }
}

/** What the CLI is told when nobody answers in time, or the answer is malformed. */
export function claudeModsAskDefaultAnswer(subtype: ClaudeModsAskSubtype): ClaudeModsAskAnswer {
  switch (subtype) {
    case 'ui_copy':
      return { copied: false }
    case 'ui_prompt_read':
      return { text: '', cursor: 0 }
    case 'ui_prompt_fill':
      return { filled: false }
    case 'ui_prompt_suggest':
      return { shown: false }
  }
}

function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** A renderer's answer checked against its ask, or the default when it does not fit. */
export function readClaudeModsAskAnswer(
  subtype: ClaudeModsAskSubtype,
  value: unknown
): ClaudeModsAskAnswer {
  const fallback = claudeModsAskDefaultAnswer(subtype)
  if (!isRecord(value)) {
    return fallback
  }
  switch (subtype) {
    case 'ui_copy': {
      const copied = flag(value.copied)
      return copied === null ? fallback : { copied }
    }
    case 'ui_prompt_read': {
      const { text, cursor } = value
      return typeof text === 'string' &&
        text.length <= MAX_CLAUDE_MODS_ASK_TEXT &&
        typeof cursor === 'number' &&
        Number.isInteger(cursor) &&
        cursor >= 0 &&
        cursor <= text.length
        ? { text, cursor }
        : fallback
    }
    case 'ui_prompt_fill': {
      const filled = flag(value.filled)
      return filled === null ? fallback : { filled }
    }
    case 'ui_prompt_suggest': {
      const shown = flag(value.shown)
      return shown === null ? fallback : { shown }
    }
  }
}
