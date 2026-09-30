import type { CommandHandler } from '../dispatch'
import { getOptionalPositiveIntegerFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import {
  parseTerminalInteractionRequest,
  requestTerminalInteraction
} from '../terminal-interaction-client'
import { runTerminalInteractionMcpServer } from '../terminal-interaction-mcp'
import { runStructuredInteractionMcpServer } from '../structured-interaction-mcp'

const MAX_REQUEST_BYTES = 256 * 1024

export const INTERACT_HANDLERS: Record<string, CommandHandler> = {
  'interact request': async ({ flags, client }) => {
    if (flags.get('request-stdin') !== true) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Pass --request-stdin and provide the interaction request as JSON on standard input.'
      )
    }
    const request = parseTerminalInteractionRequest(await readJsonRequest())
    const timeoutMs = getOptionalPositiveIntegerFlag(flags, 'timeout-ms')
    const result = await requestTerminalInteraction(client, request, { timeoutMs })
    process.stdout.write(`${JSON.stringify({ result })}\n`)
  },
  'interact mcp': async ({ client }) => {
    await runTerminalInteractionMcpServer(client)
  },
  'interact chat-mcp': async () => {
    await runStructuredInteractionMcpServer()
  }
}

async function readJsonRequest(): Promise<unknown> {
  if (process.stdin.isTTY) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass interaction request JSON on standard input.'
    )
  }
  const chunks: Buffer[] = []
  let byteLength = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    byteLength += buffer.length
    if (byteLength > MAX_REQUEST_BYTES) {
      throw new RuntimeClientError('invalid_argument', 'Interaction request is too large.')
    }
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Interaction request must be JSON.')
  }
}
