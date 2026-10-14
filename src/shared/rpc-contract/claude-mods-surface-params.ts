import { z } from 'zod'
import { CLAUDE_MODS_REQUEST_SUBTYPES } from '../claude-mods-surface'
import { SessionId } from './structured-agent-session-identifiers'

/** Above the largest body the CLI takes (ui_message data, 100000 chars), with room for the address. */
export const MAX_CLAUDE_MODS_REQUEST_BYTES = 160 * 1024

/** A read answers the whole draft, at most MAX_CLAUDE_MODS_ASK_TEXT characters. */
export const MAX_CLAUDE_MODS_ANSWER_BYTES = 320 * 1024

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

/** A composer's stream of the CLI's asks (copy, read, fill, suggest) for one session. */
export const ClaudeModsAsksParams = z.object({ sessionId: SessionId }).strict()

/** The composer's answer to one ask; the host checks its shape against the ask. */
export const ClaudeModsAnswerParams = z
  .object({
    sessionId: SessionId,
    askId: z.string().min(1).max(128),
    response: z
      .record(z.string(), z.unknown())
      .refine(
        (response) => JSON.stringify(response).length <= MAX_CLAUDE_MODS_ANSWER_BYTES,
        'Claude mods answer is too large'
      )
  })
  .strict()
