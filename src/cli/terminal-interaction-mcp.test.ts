import { PassThrough, Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCA_INTERACT_INPUT_SCHEMA } from '../shared/orca-interaction-tool'
import { runTerminalInteractionMcpServer } from './terminal-interaction-mcp'

const originalEnvironment = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnvironment)
})

describe('terminal interaction MCP server', () => {
  it('discovers the shared interaction schema only inside an Orca terminal', async () => {
    delete process.env.ORCA_TERMINAL_HANDLE
    delete process.env.ORCA_PANE_KEY
    const withoutIdentity = await exchange([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }])
    expect((withoutIdentity[0].result as { tools: unknown[] }).tools).toEqual([])

    process.env.ORCA_TERMINAL_HANDLE = 'terminal-current'
    process.env.ORCA_PANE_KEY = 'pane-current'
    const withIdentity = await exchange([{ jsonrpc: '2.0', id: 2, method: 'tools/list' }])
    expect((withIdentity[0].result as { tools: unknown[] }).tools).toEqual([
      expect.objectContaining({ name: 'interact', inputSchema: ORCA_INTERACT_INPUT_SCHEMA })
    ])
  })

  it('allows concurrent calls to complete independently', async () => {
    process.env.ORCA_TERMINAL_HANDLE = 'terminal-current'
    process.env.ORCA_PANE_KEY = 'pane-current'
    const waits = new Map<string, (value: unknown) => void>()
    const call = vi.fn(
      (method: string, params: { requestId: string; request?: { title?: string } }) => {
        if (method === 'terminalInteraction.request') {
          return Promise.resolve({ result: { requestId: params.requestId, status: 'pending' } })
        }
        if (method === 'terminalInteraction.wait') {
          return new Promise((resolve) => waits.set(params.requestId, resolve))
        }
        return Promise.resolve({ result: {} })
      }
    )
    const input = new PassThrough()
    const output: Record<string, unknown>[] = []
    const server = runTerminalInteractionMcpServer({ call } as never, input, (value) =>
      output.push(value)
    )
    input.write(`${JSON.stringify(toolCall('first', 'First'))}\n`)
    input.write(`${JSON.stringify(toolCall('second', 'Second'))}\n`)
    await vi.waitFor(() => expect(waits.size).toBe(2))
    const requests = call.mock.calls
      .filter(([method]) => method === 'terminalInteraction.request')
      .map(([, params]) => params as { requestId: string; request: { title: string } })
    for (const item of requests.toReversed()) {
      waits.get(item.requestId)?.({
        result: {
          requestId: item.requestId,
          status: 'completed',
          result: { status: 'submitted', values: { answer: item.request.title } }
        }
      })
    }
    await vi.waitFor(() => expect(output).toHaveLength(2))
    input.end()
    await server

    expect(output.map((message) => message.id).sort()).toEqual(['first', 'second'])
    expect(
      output.map(
        (message) =>
          (message.result as { structuredContent: { values: { answer: string } } })
            .structuredContent.values.answer
      )
    ).toEqual(['Second', 'First'])
  })

  it('maps MCP cancellation to backend cleanup without waiting for the long poll', async () => {
    process.env.ORCA_TERMINAL_HANDLE = 'terminal-current'
    process.env.ORCA_PANE_KEY = 'pane-current'
    const call = vi.fn((method: string, params: { requestId: string }) => {
      if (method === 'terminalInteraction.request') {
        return Promise.resolve({ result: { requestId: params.requestId, status: 'pending' } })
      }
      if (method === 'terminalInteraction.wait') {
        return new Promise(() => {})
      }
      return Promise.resolve({ result: { requestId: params.requestId, status: 'completed' } })
    })
    const input = new PassThrough()
    const output: Record<string, unknown>[] = []
    const server = runTerminalInteractionMcpServer({ call } as never, input, (value) =>
      output.push(value)
    )
    input.write(`${JSON.stringify(toolCall('cancel-me', 'Cancel'))}\n`)
    await vi.waitFor(() =>
      expect(call.mock.calls.some(([method]) => method === 'terminalInteraction.wait')).toBe(true)
    )
    input.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'cancel-me' } })}\n`
    )
    await vi.waitFor(() =>
      expect(call.mock.calls.some(([method]) => method === 'terminalInteraction.cancel')).toBe(true)
    )
    await vi.waitFor(() => expect(output).toHaveLength(1))
    input.end()
    await server
    expect(output[0].result).toMatchObject({ isError: true })
  })
})

function toolCall(id: string, title: string) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'interact',
      arguments: { title, fields: [{ id: 'answer', type: 'text', label: 'Answer' }] }
    }
  }
}

async function exchange(messages: unknown[]): Promise<Record<string, unknown>[]> {
  const output: Record<string, unknown>[] = []
  await runTerminalInteractionMcpServer(
    { call: vi.fn() } as never,
    Readable.from(messages.map((message) => `${JSON.stringify(message)}\n`)),
    (value) => output.push(value)
  )
  await vi.waitFor(() => expect(output).toHaveLength(messages.length))
  return output
}
