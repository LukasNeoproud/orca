import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { runStdioMcpServer } from './stdio-mcp-server'

describe('stdio MCP server', () => {
  it('accepts a complete frame at the 2 MiB wire limit', async () => {
    const output: Record<string, unknown>[] = []
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      payloadBytes: Buffer.byteLength(args.payload as string)
    }))
    const frame = sizedToolCall(2 * 1024 * 1024)

    await runStdioMcpServer(
      { serverInfo: { name: 'test', version: '1' }, listTools: () => [], callTool },
      PassThrough.from(`${frame}\n`),
      (value) => output.push(value)
    )

    expect(Buffer.byteLength(frame)).toBe(2 * 1024 * 1024)
    expect(callTool).toHaveBeenCalledOnce()
    expect(toolResponses(output)[0].result).toMatchObject({
      structuredContent: { payloadBytes: expect.any(Number) }
    })
  })

  it('rejects and discards a frame beyond the 2 MiB wire limit', async () => {
    const output: Record<string, unknown>[] = []
    const callTool = vi.fn()
    const frame = sizedToolCall(2 * 1024 * 1024 + 1)

    await runStdioMcpServer(
      { serverInfo: { name: 'test', version: '1' }, listTools: () => [], callTool },
      PassThrough.from(`${frame}\n`),
      (value) => output.push(value)
    )

    expect(Buffer.byteLength(frame)).toBe(2 * 1024 * 1024 + 1)
    expect(callTool).not.toHaveBeenCalled()
    expect(output).toEqual([
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Request exceeds the MCP line limit' }
      }
    ])
  })

  it('correlates concurrent client requests independently', async () => {
    const input = new PassThrough()
    const output: Record<string, unknown>[] = []
    const server = runStdioMcpServer(
      {
        serverInfo: { name: 'test', version: '1' },
        listTools: () => [],
        callTool: async (name, _args, signal, requestClient) =>
          await requestClient('example/request', { name }, signal)
      },
      input,
      (value) => output.push(value)
    )
    input.write(`${JSON.stringify(toolCall('first', 'one'))}\n`)
    input.write(`${JSON.stringify(toolCall('second', 'two'))}\n`)
    await vi.waitFor(() => expect(clientRequests(output)).toHaveLength(2))

    for (const request of clientRequests(output).toReversed()) {
      input.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { echoed: request.params.name } })}\n`
      )
    }
    await vi.waitFor(() => expect(toolResponses(output)).toHaveLength(2))
    input.end()
    await server

    expect(
      toolResponses(output).map((response) => [
        response.id,
        (response.result as { structuredContent: { echoed: string } }).structuredContent.echoed
      ])
    ).toEqual([
      ['second', 'two'],
      ['first', 'one']
    ])
  })

  it('rejects duplicate active ids and awaits abort cleanup at EOF', async () => {
    const input = new PassThrough()
    const output: Record<string, unknown>[] = []
    const cleanup = vi.fn()
    const server = runStdioMcpServer(
      {
        serverInfo: { name: 'test', version: '1' },
        listTools: () => [],
        callTool: async (_name, _args, signal) =>
          await new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                cleanup()
                reject(new Error('aborted'))
              },
              { once: true }
            )
          })
      },
      input,
      (value) => output.push(value)
    )
    const call = {
      jsonrpc: '2.0',
      id: 'same-id',
      method: 'tools/call',
      params: { name: 'wait', arguments: {} }
    }
    input.write(`${JSON.stringify(call)}\n${JSON.stringify(call)}\n`)
    await vi.waitFor(() =>
      expect(output).toContainEqual(
        expect.objectContaining({
          id: 'same-id',
          error: expect.objectContaining({ message: 'A request with this id is already active' })
        })
      )
    )
    input.end()
    await server

    expect(cleanup).toHaveBeenCalledOnce()
    expect(output).toContainEqual(
      expect.objectContaining({ id: 'same-id', result: expect.objectContaining({ isError: true }) })
    )
  })

  it('cancels an outstanding client request when its tool call is cancelled', async () => {
    const input = new PassThrough()
    const output: Record<string, unknown>[] = []
    const server = runStdioMcpServer(
      {
        serverInfo: { name: 'test', version: '1' },
        listTools: () => [],
        callTool: async (_name, _args, signal, requestClient) =>
          await requestClient('example/request', {}, signal)
      },
      input,
      (value) => output.push(value)
    )
    input.write(`${JSON.stringify(toolCall('cancel-me', 'wait'))}\n`)
    await vi.waitFor(() => expect(clientRequests(output)).toHaveLength(1))
    input.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'cancel-me' } })}\n`
    )
    await vi.waitFor(() => expect(toolResponses(output)).toHaveLength(1))
    input.end()
    await server

    expect(output).toContainEqual({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: clientRequests(output)[0].id }
    })
    expect(toolResponses(output)[0].result).toMatchObject({ isError: true })
  })

  it('rejects and removes an outstanding client request at EOF', async () => {
    const input = new PassThrough()
    const output: Record<string, unknown>[] = []
    const server = runStdioMcpServer(
      {
        serverInfo: { name: 'test', version: '1' },
        listTools: () => [],
        callTool: async (_name, _args, signal, requestClient) =>
          await requestClient('example/request', {}, signal)
      },
      input,
      (value) => output.push(value)
    )
    input.write(`${JSON.stringify(toolCall('eof', 'wait'))}\n`)
    await vi.waitFor(() => expect(clientRequests(output)).toHaveLength(1))
    const clientRequestId = clientRequests(output)[0].id
    input.end()
    await server

    expect(
      output.filter(
        (message) =>
          message.method === 'notifications/cancelled' &&
          (message.params as { requestId?: unknown }).requestId === clientRequestId
      )
    ).toHaveLength(1)
    expect(toolResponses(output)).toEqual([
      expect.objectContaining({ id: 'eof', result: expect.objectContaining({ isError: true }) })
    ])
  })
})

function toolCall(id: string, name: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } }
}

function clientRequests(output: Record<string, unknown>[]) {
  return output.filter(
    (
      message
    ): message is Record<string, unknown> & { id: string; params: Record<string, unknown> } =>
      message.method === 'example/request'
  )
}

function toolResponses(output: Record<string, unknown>[]) {
  return output.filter((message) => 'result' in message && !('method' in message))
}

function sizedToolCall(byteLength: number): string {
  const empty = JSON.stringify({
    jsonrpc: '2.0',
    id: 'sized',
    method: 'tools/call',
    params: { name: 'sized', arguments: { payload: '' } }
  })
  return empty.replace('"payload":""', `"payload":"${'x'.repeat(byteLength - empty.length)}"`)
}
