import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  decodeOrcaInteractionElicitationMessage,
  encodeOrcaInteractionElicitationResponse,
  ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
} from '../shared/orca-interaction-elicitation'
import { runStructuredInteractionMcpServer } from './structured-interaction-mcp'

const request = {
  title: 'Choose',
  fields: [
    {
      id: 'choice',
      type: 'single_choice' as const,
      label: 'Choice',
      options: [
        { id: 'first', label: 'First' },
        { id: 'second', label: 'Second' }
      ]
    }
  ]
}

describe('structured interaction MCP server', () => {
  it('negotiates elicitation protocol support and advertises a safe tool', async () => {
    const harness = startServer()
    harness.input.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 'initialize',
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {} }
      })}\n`
    )
    harness.input.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 'tools', method: 'tools/list' })}\n`
    )
    const initialize = await harness.waitForToolResult('initialize')
    const tools = await harness.waitForToolResult('tools')
    await harness.close()

    expect(initialize).toMatchObject({
      protocolVersion: '2025-06-18',
      instructions: expect.stringContaining('independent structured fields')
    })
    expect(tools).toMatchObject({
      tools: [
        {
          name: 'interact',
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
        }
      ]
    })
  })

  it('round-trips an accepted elicitation through real stdio messages', async () => {
    const harness = startServer()
    harness.input.write(`${JSON.stringify(toolCall('call-1'))}\n`)
    const elicitation = await harness.waitForElicitation()

    expect(elicitation.params).toMatchObject({
      mode: 'form',
      requestedSchema: ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
    })
    expect(decodeOrcaInteractionElicitationMessage(elicitation.params.message)).toEqual(request)
    harness.respond(elicitation.id, {
      result: encodeOrcaInteractionElicitationResponse({
        status: 'submitted',
        values: { choice: 'second' }
      })
    })
    const result = await harness.waitForToolResult('call-1')
    await harness.close()

    expect(result).toMatchObject({
      structuredContent: { status: 'submitted', values: { choice: 'second' } }
    })
  })

  it.each(['decline', 'cancel'] as const)('returns raw cancellation for %s', async (action) => {
    const harness = startServer()
    harness.input.write(`${JSON.stringify(toolCall('call-cancelled'))}\n`)
    const elicitation = await harness.waitForElicitation()
    harness.respond(elicitation.id, { result: { action, content: null, _meta: null } })
    const result = await harness.waitForToolResult('call-cancelled')
    await harness.close()

    expect(result).toMatchObject({
      structuredContent: { status: 'cancelled' },
      content: [{ type: 'text', text: JSON.stringify({ status: 'cancelled' }) }]
    })
    expect(result).not.toHaveProperty('isError')
  })

  it('rejects an invalid accepted answer as a tool error', async () => {
    const harness = startServer()
    harness.input.write(`${JSON.stringify(toolCall('call-invalid'))}\n`)
    const elicitation = await harness.waitForElicitation()
    harness.respond(elicitation.id, {
      result: { action: 'accept', content: { answer: 'not-an-orca-answer' } }
    })
    const result = await harness.waitForToolResult('call-invalid')
    await harness.close()

    expect(result).toMatchObject({ isError: true })
  })

  it('cleans up an outstanding elicitation when input reaches EOF', async () => {
    const harness = startServer()
    harness.input.write(`${JSON.stringify(toolCall('call-eof'))}\n`)
    await harness.waitForElicitation()
    await harness.close()

    expect(await harness.waitForToolResult('call-eof')).toMatchObject({ isError: true })
  })
})

function toolCall(id: string) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'interact', arguments: request }
  }
}

function startServer() {
  const input = new PassThrough()
  const output: Record<string, unknown>[] = []
  const server = runStructuredInteractionMcpServer(input, (value) => output.push(value), {})
  return {
    input,
    respond(id: string, response: Record<string, unknown>) {
      input.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...response })}\n`)
    },
    async waitForElicitation() {
      await vi.waitFor(() =>
        expect(output.some((message) => message.method === 'elicitation/create')).toBe(true)
      )
      return output.find((message) => message.method === 'elicitation/create') as {
        id: string
        params: Record<string, unknown>
      }
    },
    async waitForToolResult(id: string) {
      await vi.waitFor(() =>
        expect(output.some((message) => message.id === id && 'result' in message)).toBe(true)
      )
      return output.find((message) => message.id === id)?.result as Record<string, unknown>
    },
    async close() {
      input.end()
      await server
    }
  }
}
