import { z } from 'zod'
import { CLAUDE_MODS_REQUEST_SUBTYPES } from '../claude-mods-surface'
import { SessionId } from './structured-agent-session-identifiers'

/** Above the largest body the CLI takes (ui_message data, 100000 chars), with room for the address. */
export const MAX_CLAUDE_MODS_REQUEST_BYTES = 160 * 1024

/** `fields` are the CLI's own request body; the host adds whose surface asks and the CLI checks the rest. */
export const ClaudeModsRequestParams = z
  .object({
    sessionId: SessionId,
    subtype: z.enum(CLAUDE_MODS_REQUEST_SUBTYPES),
    fields: z
      .record(z.string(), z.unknown())
      .refine(
        (fields) => JSON.stringify(fields).length <= MAX_CLAUDE_MODS_REQUEST_BYTES,
        'Claude mods request is too large'
      )
  })
  .strict()

export const ClaudeModsSubscribeParams = z.object({ sessionId: SessionId }).strict()
