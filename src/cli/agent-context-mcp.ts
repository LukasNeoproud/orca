import { StringDecoder } from 'node:string_decoder'
import { RuntimeClient } from './runtime-client'
import { contextTools } from './agent-context-mcp-tools'
import {
  agentContextCallerFromEnvironment,
  agentContextRequestId,
  agentContextTransitionInput
} from './agent-context-transition'
import type { AgentContextTransitionInput } from '../shared/agent-context-transition'

const MCP_PROTOCOL_VERSION = '2025-03-26'
const SERVER_INFO = { name: 'orca-context-management', version: '1.0.0' }
const MAX_MCP_LINE_BYTES = 64 * 1024

type JsonRecord = Record<string, unknown>
type McpWriter = (value: JsonRecord) => void
type AgentContextMcpClient = Pick<RuntimeClient, 'call'>

export function runAgentContextMcpServer(
  client: AgentContextMcpClient = new RuntimeClient(),
  input: NodeJS.ReadableStream = process.stdin,
  write: McpWriter = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
): Promise<void> {
  return serveLines(input, client, write)
}

async function serveLines(
  input: NodeJS.ReadableStream,
  client: AgentContextMcpClient,
  write: McpWriter
): Promise<void> {
  const decoder = new StringDecoder('utf8')
  let remainder = ''
  let discardingOversizedLine = false
  for await (const chunk of input) {
    const text = decoder.write(Buffer.from(chunk))
    if (discardingOversizedLine) {
      const newline = text.indexOf('\n')
      if (newline === -1) {
        continue
      }
      discardingOversizedLine = false
      remainder = text.slice(newline + 1)
    } else {
      remainder += text
    }
    let newline = remainder.indexOf('\n')
    while (newline !== -1) {
      const rawLine = remainder.slice(0, newline)
      remainder = remainder.slice(newline + 1)
      if (Buffer.byteLength(rawLine, 'utf8') > MAX_MCP_LINE_BYTES) {
        write(errorResponse(null, -32600, 'Request exceeds the MCP line limit'))
      } else {
        await handleMcpLine(rawLine.replace(/\r$/, ''), client, write)
      }
      newline = remainder.indexOf('\n')
    }
    if (Buffer.byteLength(remainder, 'utf8') > MAX_MCP_LINE_BYTES) {
      write(errorResponse(null, -32600, 'Request exceeds the MCP line limit'))
      remainder = ''
      discardingOversizedLine = true
    }
  }
  remainder += decoder.end()
  if (remainder && !discardingOversizedLine) {
    if (Buffer.byteLength(remainder, 'utf8') > MAX_MCP_LINE_BYTES) {
      write(errorResponse(null, -32600, 'Request exceeds the MCP line limit'))
      return
    }
    await handleMcpLine(remainder.replace(/\r$/, ''), client, write)
  }
}

async function handleMcpLine(
  line: string,
  client: AgentContextMcpClient,
  write: McpWriter
): Promise<void> {
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    write(errorResponse(null, -32700, 'Parse error'))
    return
  }
  await handleAgentContextMcpMessage(message, client, write)
}

export async function handleAgentContextMcpMessage(
  message: unknown,
  client: AgentContextMcpClient,
  write: McpWriter
): Promise<void> {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    write(
      errorResponse(isRecord(message) ? requestId(message.id) : null, -32600, 'Invalid Request')
    )
    return
  }
  const id = requestId(message.id)
  if (message.method.startsWith('notifications/')) {
    return
  }
  if (id === null) {
    return
  }
  try {
    const result = await dispatchMcpRequest(message.method, message.params, client)
    write({ jsonrpc: '2.0', id, result })
  } catch (error) {
    if (error instanceof McpMethodNotFoundError) {
      write(errorResponse(id, -32601, error.message))
      return
    }
    write(errorResponse(id, -32603, error instanceof Error ? error.message : 'Internal error'))
  }
}

async function dispatchMcpRequest(
  method: string,
  params: unknown,
  client: AgentContextMcpClient
): Promise<unknown> {
  switch (method) {
    case 'initialize':
      if (!isRecord(params) || typeof params.protocolVersion !== 'string') {
        throw new Error('Invalid initialize parameters')
      }
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: contextTools() }
    case 'tools/call':
      return await callContextTool(params, client)
    default:
      throw new McpMethodNotFoundError(method)
  }
}

async function callContextTool(params: unknown, client: AgentContextMcpClient): Promise<unknown> {
  if (
    !isRecord(params) ||
    typeof params.name !== 'string' ||
    (params.arguments !== undefined && !isRecord(params.arguments))
  ) {
    throw new Error('Invalid tools/call parameters')
  }
  try {
    const caller = agentContextCallerFromEnvironment()
    const args = (params.arguments ?? {}) as JsonRecord
    const result = await toolResult(params.name, args, caller, client)
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Context transition failed'
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

async function toolResult(
  name: string,
  args: JsonRecord,
  caller: ReturnType<typeof agentContextCallerFromEnvironment>,
  client: AgentContextMcpClient
): Promise<unknown> {
  if (name === 'request_compact' || name === 'request_fresh_context') {
    const input = agentContextTransitionInput({
      mode: name === 'request_compact' ? 'compact' : 'fresh',
      checkpoint: requiredRecord(args, 'checkpoint'),
      reason: requiredString(args, 'reason'),
      continuation: requiredContinuation(args)
    })
    return (
      await client.call('agentContext.request', {
        caller,
        requestId: agentContextRequestId(optionalString(args, 'requestId')),
        input
      })
    ).result
  }
  if (name === 'context_request_status') {
    return (
      await client.call('agentContext.status', {
        caller,
        requestId: agentContextRequestId(requiredString(args, 'requestId'))
      })
    ).result
  }
  if (name === 'cancel_context_request') {
    return (
      await client.call('agentContext.cancel', {
        caller,
        requestId: agentContextRequestId(requiredString(args, 'requestId'))
      })
    ).result
  }
  if (name === 'context_transition_state') {
    return (await client.call('agentContext.state', { caller })).result
  }
  throw new Error(`Unknown tool: ${name}`)
}

function optionalString(args: JsonRecord, name: string): string | undefined {
  const value = args[name]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${name}`)
  }
  return value
}

function requiredString(args: JsonRecord, name: string): string {
  const value = optionalString(args, name)
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function requiredRecord(args: JsonRecord, name: string): JsonRecord {
  const value = args[name]
  if (!isRecord(value)) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function requiredContinuation(args: JsonRecord): AgentContextTransitionInput['continuation'] {
  const value = optionalString(args, 'continuation')
  if (value !== 'wait-for-user' && value !== 'continue') {
    throw new Error('Invalid continuation')
  }
  return value
}

function requestId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

function errorResponse(id: string | number | null, code: number, message: string): JsonRecord {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

class McpMethodNotFoundError extends Error {
  constructor(method: string) {
    super(`Method not found: ${method}`)
  }
}
