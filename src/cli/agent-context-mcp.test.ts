import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAgentContextMcpServer } from './agent-context-mcp'

const originalEnvironment = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnvironment)
})

describe('agent context MCP server', () => {
  it('keeps JSON-RPC ids while initializing, listing tools, and calling a tool', async () => {
    process.env.ORCA_AGENT_SESSION_ID = 'session_current'
    process.env.ORCA_AGENT_SESSION_SPAWN_TOKEN = 'spawn_current'
    const call = vi
      .fn()
      .mockResolvedValue({ result: { requestId: 'request_current', status: 'queued' } })
    const output: Record<string, unknown>[] = []
    const checkpoint = {
      goal: 'Ship the plugin',
      completed: 'Transport is ready',
      decisions: [],
      constraints: [],
      changes: [],
      verification: [],
      openQuestions: [],
      nextStep: 'Run the focused validation.'
    }
    const messages = [
      {
        jsonrpc: '2.0',
        id: 'initialize-id',
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' }
      },
      { jsonrpc: '2.0', id: 'list-id', method: 'tools/list' },
      {
        jsonrpc: '2.0',
        id: 'call-id',
        method: 'tools/call',
        params: {
          name: 'request_compact',
          arguments: {
            requestId: 'request_current',
            checkpoint,
            reason: 'Ready to compact',
            continuation: 'continue'
          }
        }
      }
    ]

    await runAgentContextMcpServer(
      { call } as never,
      Readable.from(messages.map((message) => `${JSON.stringify(message)}\n`)),
      (message) => output.push(message)
    )

    expect(output.map((message) => message.id)).toEqual(['initialize-id', 'list-id', 'call-id'])
    const toolList = (
      output[1].result as { tools: { name: string; inputSchema: { required?: string[] } }[] }
    ).tools
    expect(toolList.find((tool) => tool.name === 'request_compact')?.inputSchema.required).toEqual([
      'checkpoint',
      'reason',
      'continuation'
    ])
    expect(call).toHaveBeenCalledWith('agentContext.request', {
      caller: { sessionId: 'session_current', spawnToken: 'spawn_current' },
      requestId: 'request_current',
      input: { mode: 'compact', checkpoint, reason: 'Ready to compact', continuation: 'continue' }
    })
  })

  it('rejects an oversized line without retaining it', async () => {
    const output: Record<string, unknown>[] = []

    await runAgentContextMcpServer(
      { call: vi.fn() } as never,
      Readable.from([`${'x'.repeat(64 * 1024 + 1)}\n`]),
      (message) => output.push(message)
    )

    expect(output).toEqual([
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Request exceeds the MCP line limit' }
      }
    ])
  })
})
