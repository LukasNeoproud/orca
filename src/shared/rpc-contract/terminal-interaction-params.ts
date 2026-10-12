import { z } from 'zod'
import { OrcaInteractionRequestSchema } from '../orca-interaction'
import { TERMINAL_INTERACTION_WAIT_MAX_MS } from '../terminal-interaction'

const InteractionCaller = z
  .object({
    terminalHandle: z.string().min(1).max(512),
    paneKey: z.string().min(1).max(512)
  })
  .strict()

export const TerminalInteractionRequestParams = z
  .object({
    caller: InteractionCaller,
    requestId: z.string().min(1).max(512),
    request: OrcaInteractionRequestSchema
  })
  .strict()

export const TerminalInteractionWaitParams = z
  .object({
    caller: InteractionCaller,
    requestId: z.string().min(1).max(512),
    timeoutMs: z.number().int().min(0).max(TERMINAL_INTERACTION_WAIT_MAX_MS)
  })
  .strict()

export const TerminalInteractionCancelParams = z
  .object({
    caller: InteractionCaller,
    requestId: z.string().min(1).max(512)
  })
  .strict()

export const TerminalInteractionRespondParams = z
  .object({
    requestId: z.string().min(1).max(512),
    result: z.unknown()
  })
  .strict()
