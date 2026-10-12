import { describe, expect, it, vi } from 'vitest'
import {
  CodexAppServerRequestError,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import { openCodexThread } from './codex-structured-thread-open'
import { codexInteractionMcpConfig } from './codex-interaction-mcp-config'
import {
  ORCA_INTERACTIVE_UI_INSTRUCTIONS,
  ORCA_INTERACT_DYNAMIC_TOOLS
} from './codex-orca-interaction'

function connectionFor(
  request: CodexAppServerConnection['request'],
  prepareInteractionBridge?: CodexAppServerConnection['prepareInteractionBridge']
): Pick<CodexAppServerConnection, 'request' | 'prepareInteractionBridge'> {
  return { request, prepareInteractionBridge }
}

describe('openCodexThread Orca interactions', () => {
  it('resumes with the interaction MCP config without reading or replacing instructions', async () => {
    const request = vi.fn(async () => ({ thread: { id: 'legacy' } }))
    const bridgeEnvironment = {
      ORCA_INTERACTION_SOCKET: '/tmp/orca-interaction.sock',
      ORCA_INTERACTION_TOKEN: 'bridge-token'
    }
    const prepareInteractionBridge = vi.fn(async () => bridgeEnvironment)
    await openCodexThread(
      connectionFor(request, prepareInteractionBridge),
      { cwd: '/workspace', resumeThreadId: 'legacy' },
      1000
    )
    expect(prepareInteractionBridge).toHaveBeenCalledWith('legacy')
    expect(prepareInteractionBridge.mock.invocationCallOrder[0]).toBeLessThan(
      request.mock.invocationCallOrder[0]!
    )
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith(
      'thread/resume',
      {
        threadId: 'legacy',
        cwd: '/workspace',
        excludeTurns: true,
        config: codexInteractionMcpConfig(bridgeEnvironment)
      },
      { timeoutMs: 1000 }
    )
  })

  it('exposes the dynamic interaction tool and overlay when starting a thread', async () => {
    const request = vi.fn(async (method: string) =>
      method === 'config/read'
        ? { config: { developer_instructions: 'Keep the existing workflow.' } }
        : { thread: { id: 'thread-1' } }
    )

    const prepareInteractionBridge = vi.fn()
    await openCodexThread(
      connectionFor(request, prepareInteractionBridge),
      { cwd: '/workspace', resumeThreadId: null },
      1_000
    )

    expect(prepareInteractionBridge).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledWith('config/read', { cwd: '/workspace' }, { timeoutMs: 1_000 })
    expect(request).toHaveBeenCalledWith(
      'thread/start',
      {
        cwd: '/workspace',
        developerInstructions: `Keep the existing workflow.\n\n${ORCA_INTERACTIVE_UI_INSTRUCTIONS}`,
        dynamicTools: ORCA_INTERACT_DYNAMIC_TOOLS
      },
      { timeoutMs: 1_000 }
    )
  })

  it('falls back once when an older app-server rejects interactive start fields', async () => {
    const request = vi.fn(async (_method: string, params?: Record<string, unknown>) => {
      if (params?.dynamicTools) {
        throw new CodexAppServerRequestError('thread/start', -32602, 'unknown field `dynamicTools`')
      }
      return { thread: { id: 'thread-1' } }
    })
    const environment = {
      ORCA_INTERACTION_SOCKET: '/tmp/test.sock',
      ORCA_INTERACTION_TOKEN: 'test'
    }
    const prepare = vi.fn(async () => environment)
    const connection = connectionFor(request, prepare)

    await expect(
      openCodexThread(connection, { cwd: '/workspace', resumeThreadId: null }, 1_000)
    ).resolves.toMatchObject({ interactionMcp: true })
    await openCodexThread(connection, { cwd: '/workspace', resumeThreadId: null }, 1_000)

    const resume = {
      threadId: 'thread-1',
      cwd: '/workspace',
      excludeTurns: true,
      config: codexInteractionMcpConfig(environment)
    }
    expect(request.mock.calls.map(([, params]) => params)).toEqual([
      { cwd: '/workspace' },
      expect.objectContaining({ dynamicTools: ORCA_INTERACT_DYNAMIC_TOOLS }),
      { cwd: '/workspace' },
      resume,
      { cwd: '/workspace' },
      resume
    ])
    expect(prepare).toHaveBeenCalledWith('thread-1')
  })

  it('refuses an interaction fallback that resumes a different thread', async () => {
    const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (params?.dynamicTools) {
        throw new CodexAppServerRequestError('thread/start', -32602, 'unknown field `dynamicTools`')
      }
      return { thread: { id: method === 'thread/resume' ? 'wrong-thread' : 'thread-1' } }
    })
    await expect(
      openCodexThread(
        connectionFor(request),
        {
          cwd: '/workspace',
          resumeThreadId: null
        },
        1000
      )
    ).rejects.toThrow('different thread')
  })

  it('does not replace configured instructions when config/read is unavailable', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'config/read') {
        throw new CodexAppServerRequestError('config/read', -32601, 'method not found')
      }
      return { thread: { id: 'thread-1' } }
    })

    await openCodexThread(
      connectionFor(request),
      { cwd: '/workspace', resumeThreadId: null },
      1_000
    )

    expect(request).toHaveBeenLastCalledWith(
      'thread/start',
      { cwd: '/workspace', dynamicTools: ORCA_INTERACT_DYNAMIC_TOOLS },
      { timeoutMs: 1_000 }
    )
  })
})
