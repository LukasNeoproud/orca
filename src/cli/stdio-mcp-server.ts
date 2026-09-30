import { StringDecoder } from 'node:string_decoder'

const MAX_MCP_LINE_BYTES = 2 * 1024 * 1024
const MAX_ACTIVE_REQUESTS = 32

export type McpJsonRecord = Record<string, unknown>
export type McpToolDefinition = {
  name: string
  description: string
  inputSchema: McpJsonRecord
  annotations?: McpJsonRecord
}
export type McpClientRequest = (
  method: string,
  params: McpJsonRecord,
  signal: AbortSignal
) => Promise<unknown>

type McpServerOptions = {
  serverInfo: { name: string; version: string }
  protocolVersion?: string
  instructions?: string
  listTools: () => McpToolDefinition[]
  callTool: (
    name: string,
    args: McpJsonRecord,
    signal: AbortSignal,
    requestClient: McpClientRequest
  ) => Promise<unknown>
  clientRequestTimeoutMs?: number
}

type PendingClientRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  removeAbortListener: () => void
}

export async function runStdioMcpServer(
  options: McpServerOptions,
  input: NodeJS.ReadableStream = process.stdin,
  write: (value: McpJsonRecord) => void = (value) =>
    process.stdout.write(`${JSON.stringify(value)}\n`)
): Promise<void> {
  const decoder = new StringDecoder('utf8')
  const active = new Map<string | number, AbortController>()
  const pending = new Set<Promise<void>>()
  const clientRequests = new Map<string, PendingClientRequest>()
  let nextClientRequestId = 1
  let remainder = ''
  let discardingOversizedLine = false

  const requestClient: McpClientRequest = (method, params, signal) => {
    if (signal.aborted) {
      return Promise.reject(new Error('MCP client request cancelled'))
    }
    const id = `orca-client-${nextClientRequestId++}`
    const timeoutMs = Math.min(Math.max(1, options.clientRequestTimeoutMs ?? 3_600_000), 3_600_000)
    return new Promise((resolve, reject) => {
      const settle = (error: Error): void => {
        const pendingRequest = clientRequests.get(id)
        if (!pendingRequest) {
          return
        }
        clientRequests.delete(id)
        clearTimeout(pendingRequest.timer)
        pendingRequest.removeAbortListener()
        reject(error)
      }
      const onAbort = (): void => {
        write({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } })
        settle(new Error('MCP client request cancelled'))
      }
      const timer = setTimeout(() => {
        write({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } })
        settle(new Error('MCP client request timed out'))
      }, timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      clientRequests.set(id, {
        resolve,
        reject,
        timer,
        removeAbortListener: () => signal.removeEventListener('abort', onAbort)
      })
      write({ jsonrpc: '2.0', id, method, params })
    })
  }

  const handleClientResponse = (message: McpJsonRecord): boolean => {
    const id = requestId(message.id)
    if (typeof id !== 'string') {
      return false
    }
    const request = clientRequests.get(id)
    if (!request) {
      return false
    }
    clientRequests.delete(id)
    clearTimeout(request.timer)
    request.removeAbortListener()
    if ('error' in message) {
      const error = isRecord(message.error) ? message.error : {}
      request.reject(
        new Error(typeof error.message === 'string' ? error.message : 'MCP client request failed')
      )
    } else if ('result' in message) {
      request.resolve(message.result)
    } else {
      request.reject(new Error('Invalid MCP client response'))
    }
    return true
  }

  const handleLine = (line: string): void => {
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      write(errorResponse(null, -32700, 'Parse error'))
      return
    }
    if (
      isRecord(message) &&
      message.jsonrpc === '2.0' &&
      typeof message.method !== 'string' &&
      handleClientResponse(message)
    ) {
      return
    }
    if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      write(
        errorResponse(isRecord(message) ? requestId(message.id) : null, -32600, 'Invalid Request')
      )
      return
    }
    if (message.method === 'notifications/cancelled') {
      const cancelledId = isRecord(message.params) ? requestId(message.params.requestId) : null
      if (cancelledId !== null) {
        active.get(cancelledId)?.abort()
      }
      return
    }
    if (message.method.startsWith('notifications/')) {
      return
    }
    const id = requestId(message.id)
    if (id === null) {
      return
    }
    if (active.has(id)) {
      write(errorResponse(id, -32600, 'A request with this id is already active'))
      return
    }
    if (active.size >= MAX_ACTIVE_REQUESTS) {
      write(errorResponse(id, -32603, 'Too many active MCP requests'))
      return
    }
    const controller = new AbortController()
    active.set(id, controller)
    const operation = dispatchRequest(
      options,
      message.method,
      message.params,
      controller.signal,
      requestClient
    )
      .then((result) => write({ jsonrpc: '2.0', id, result }))
      .catch((error) => {
        const code = error instanceof McpMethodNotFoundError ? -32601 : -32603
        write(errorResponse(id, code, error instanceof Error ? error.message : 'Internal error'))
      })
      .finally(() => {
        active.delete(id)
        pending.delete(operation)
      })
    pending.add(operation)
  }

  try {
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
          handleLine(rawLine.replace(/\r$/, ''))
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
      } else {
        handleLine(remainder.replace(/\r$/, ''))
      }
    }
  } finally {
    for (const controller of active.values()) {
      controller.abort()
    }
    for (const request of clientRequests.values()) {
      clearTimeout(request.timer)
      request.removeAbortListener()
      request.reject(new Error('MCP input closed before the client responded'))
    }
    clientRequests.clear()
    await settlePendingOperations(pending)
  }
}

async function settlePendingOperations(pending: Set<Promise<void>>): Promise<void> {
  if (pending.size === 0) {
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.allSettled(pending),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 5_000)
    })
  ])
  if (timer) {
    clearTimeout(timer)
  }
}

async function dispatchRequest(
  options: McpServerOptions,
  method: string,
  params: unknown,
  signal: AbortSignal,
  requestClient: McpClientRequest
): Promise<unknown> {
  if (method === 'initialize') {
    if (!isRecord(params) || typeof params.protocolVersion !== 'string') {
      throw new Error('Invalid initialize parameters')
    }
    return {
      protocolVersion: options.protocolVersion ?? '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: options.serverInfo,
      ...(options.instructions ? { instructions: options.instructions } : {})
    }
  }
  if (method === 'ping') {
    return {}
  }
  if (method === 'tools/list') {
    return { tools: options.listTools() }
  }
  if (method === 'tools/call') {
    if (
      !isRecord(params) ||
      typeof params.name !== 'string' ||
      (params.arguments !== undefined && !isRecord(params.arguments))
    ) {
      throw new Error('Invalid tools/call parameters')
    }
    try {
      const result = await options.callTool(
        params.name,
        (params.arguments ?? {}) as McpJsonRecord,
        signal,
        requestClient
      )
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool call failed'
      return { content: [{ type: 'text', text: message }], isError: true }
    }
  }
  throw new McpMethodNotFoundError(method)
}

function requestId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

function errorResponse(id: string | number | null, code: number, message: string): McpJsonRecord {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function isRecord(value: unknown): value is McpJsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

class McpMethodNotFoundError extends Error {}
