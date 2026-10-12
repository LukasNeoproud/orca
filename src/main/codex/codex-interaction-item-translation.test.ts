import { describe, expect, it } from 'vitest'
import { codexItemBody } from './codex-structured-item-translation'

describe('codex Orca interaction item bodies', () => {
  it('renders a dynamic tool call without exposing the interaction response JSON', () => {
    expect(
      codexItemBody({
        type: 'dynamicToolCall',
        id: 'dynamic-1',
        namespace: 'orca',
        tool: 'interact',
        arguments: { title: 'Persistence' },
        status: 'completed',
        success: true,
        contentItems: [{ type: 'inputText', text: '{"status":"submitted"}' }]
      })
    ).toEqual({
      kind: 'tool-call',
      name: 'orca.interact',
      input: { title: 'Persistence' },
      state: 'completed',
      output: {
        head: 'Response submitted',
        byteLength: 18,
        truncated: false,
        digest: expect.any(String)
      }
    })
    expect(
      codexItemBody({
        type: 'dynamicToolCall',
        id: 'dynamic-cancelled',
        namespace: 'orca',
        tool: 'interact',
        status: 'completed',
        contentItems: [{ type: 'inputText', text: '{"status":"cancelled"}' }]
      })
    ).toMatchObject({ output: { head: 'Interaction cancelled' } })
    expect(
      codexItemBody({
        type: 'dynamicToolCall',
        id: 'dynamic-2',
        tool: 'interact',
        status: 'failed',
        success: false
      })
    ).toMatchObject({ name: 'interact', state: 'failed' })
  })

  it('renders an interaction MCP call without exposing its response JSON', () => {
    const body = codexItemBody({
      type: 'mcpToolCall',
      id: 'mcp-interaction-1',
      server: 'orca_interactive_chat',
      tool: 'interact',
      status: 'completed',
      result: {
        content: [
          {
            type: 'text',
            text: '{"status":"submitted","values":{"secret":"do not render"}}'
          }
        ]
      }
    })

    expect(body).toMatchObject({
      name: 'orca_interactive_chat/interact',
      state: 'completed',
      output: { head: 'Response submitted' }
    })
    expect(JSON.stringify(body)).not.toContain('do not render')
  })
})
