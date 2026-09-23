import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import {
  agentContextCallerFromEnvironment,
  agentContextRequestId,
  agentContextTransitionInput
} from '../agent-context-transition'
import { runAgentContextMcpServer } from '../agent-context-mcp'
import { RuntimeClientError } from '../runtime-client'

function mode(flags: Map<string, string | boolean>): 'compact' | 'fresh' {
  const value = getRequiredStringFlag(flags, 'mode')
  if (value === 'compact' || value === 'fresh') {
    return value
  }
  throw new RuntimeClientError('invalid_argument', '--mode must be compact or fresh.')
}

function formatContextResult(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export const AGENT_CONTEXT_HANDLERS: Record<string, CommandHandler> = {
  'agent-context request': async ({ flags, client, json }) => {
    const input = await readRequestInput(mode(flags))
    const result = await client.call('agentContext.request', {
      caller: agentContextCallerFromEnvironment(),
      requestId: agentContextRequestId(getOptionalStringFlag(flags, 'request-id')),
      input
    })
    printResult(result, json, formatContextResult)
  },
  'agent-context status': async ({ flags, client, json }) => {
    const result = await client.call('agentContext.status', {
      caller: agentContextCallerFromEnvironment(),
      requestId: agentContextRequestId(getRequiredStringFlag(flags, 'request-id'))
    })
    printResult(result, json, formatContextResult)
  },
  'agent-context cancel': async ({ flags, client, json }) => {
    const result = await client.call('agentContext.cancel', {
      caller: agentContextCallerFromEnvironment(),
      requestId: agentContextRequestId(getRequiredStringFlag(flags, 'request-id'))
    })
    printResult(result, json, formatContextResult)
  },
  'agent-context state': async ({ client, json }) => {
    const result = await client.call('agentContext.state', {
      caller: agentContextCallerFromEnvironment()
    })
    printResult(result, json, formatContextResult)
  },
  'agent-context mcp': async ({ client }) => {
    await runAgentContextMcpServer(client)
  }
}

async function readRequestInput(mode: 'compact' | 'fresh') {
  if (process.stdin.isTTY) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass the context-transition JSON document on standard input.'
    )
  }
  const chunks: Buffer[] = []
  let byteLength = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    byteLength += buffer.length
    if (byteLength > 32 * 1024) {
      throw new RuntimeClientError('invalid_argument', 'Context transition input is too large.')
    }
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Context transition input must be JSON.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Context transition input must be a JSON object.'
    )
  }
  return agentContextTransitionInput({ ...value, mode })
}
