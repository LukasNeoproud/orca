import { describe, expect, it, vi } from 'vitest'
import {
  CodexAppServerFrameSizeError,
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

describe('openCodexThread', () => {
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

  it('captures effective speed and permissions for both new and resumed threads', async () => {
    for (const resumeThreadId of [null, 'thread-1']) {
      const request = vi.fn(async () => ({
        thread: { id: 'thread-1' },
        serviceTier: null,
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandbox: { type: 'workspaceWrite', writableRoots: ['/workspace'], networkAccess: false }
      }))
      await expect(
        openCodexThread(connectionFor(request), { cwd: '/workspace', resumeThreadId }, 1000)
      ).resolves.toMatchObject({ serviceTier: null, permissions: 'workspace-write' })
    }
  })

  it('captures Auto review as the effective permissions preset', async () => {
    const request = vi.fn(async () => ({
      thread: { id: 'thread-1' },
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandbox: { type: 'workspaceWrite', writableRoots: ['/workspace'], networkAccess: false }
    }))
    const opened = await openCodexThread(
      connectionFor(request),
      { cwd: '/workspace', resumeThreadId: null },
      1000
    )
    expect(opened).toMatchObject({
      permissions: 'auto-review'
    })
    expect(opened).not.toHaveProperty('permissionsCustomDescription')
  })

  it('requests metadata-only state when resuming an existing thread', async () => {
    const request = vi.fn(async () => ({
      thread: { id: 'thread-1', path: '/history/thread-1.jsonl' },
      model: 'gpt-live'
    }))

    await expect(
      openCodexThread(
        connectionFor(request),
        { cwd: '/workspace', resumeThreadId: 'thread-1', resumePath: '/history/thread-1.jsonl' },
        2_000
      )
    ).resolves.toMatchObject({
      threadId: 'thread-1',
      model: 'gpt-live',
      historyRequiresRead: true
    })

    expect(request).toHaveBeenCalledWith(
      'thread/resume',
      {
        threadId: 'thread-1',
        cwd: '/workspace',
        path: '/history/thread-1.jsonl',
        config: codexInteractionMcpConfig(),
        excludeTurns: true
      },
      { timeoutMs: 2_000 }
    )
  })

  it('caches a narrowly proven excludeTurns refusal and uses one bounded fallback', async () => {
    const request = vi.fn(async (_method: string, params?: Record<string, unknown>) => {
      if (params?.excludeTurns) {
        throw new CodexAppServerRequestError(
          'thread/resume',
          -32602,
          'codex app-server thread/resume failed: unknown field `excludeTurns`'
        )
      }
      return { thread: { id: 'thread-1', turns: [{ id: 'turn-1', items: [] }] } }
    })
    const connection = connectionFor(request)

    const first = await openCodexThread(
      connection,
      { cwd: '/workspace', resumeThreadId: 'thread-1' },
      2_000
    )
    const second = await openCodexThread(
      connection,
      { cwd: '/workspace', resumeThreadId: 'thread-1' },
      2_000
    )

    expect(first.thread?.turns).toHaveLength(1)
    expect(second.thread?.turns).toHaveLength(1)
    expect(first).not.toHaveProperty('historyRequiresRead')
    expect(second).not.toHaveProperty('historyRequiresRead')
    expect(
      request.mock.calls
        .filter(([method]) => method === 'thread/resume')
        .map(([, params]) => params)
    ).toEqual([
      expect.objectContaining({ excludeTurns: true }),
      { threadId: 'thread-1', cwd: '/workspace', config: codexInteractionMcpConfig() },
      { threadId: 'thread-1', cwd: '/workspace', config: codexInteractionMcpConfig() }
    ])
  })

  it('does not retry ambiguous invalid params or oversized history responses', async () => {
    const invalid = new CodexAppServerRequestError(
      'thread/resume',
      -32602,
      'codex app-server thread/resume failed: invalid params'
    )
    const invalidRequest = vi.fn(async () => {
      throw invalid
    })
    await expect(
      openCodexThread(
        connectionFor(invalidRequest),
        { cwd: '/workspace', resumeThreadId: 'thread-1' },
        2_000
      )
    ).rejects.toBe(invalid)
    expect(invalidRequest).toHaveBeenCalledOnce()

    const oversized = new CodexAppServerFrameSizeError('thread/resume', 16_777_217, 16_777_216)
    const oversizedRequest = vi.fn(async () => {
      throw oversized
    })
    await expect(
      openCodexThread(
        connectionFor(oversizedRequest),
        { cwd: '/workspace', resumeThreadId: 'thread-1' },
        2_000
      )
    ).rejects.toBe(oversized)
    expect(oversizedRequest).toHaveBeenCalledOnce()
  })

  it('accepts a fallback result beyond the daemon wire limit', async () => {
    const request = vi.fn(async (_method: string, params?: Record<string, unknown>) => {
      if (params?.excludeTurns) {
        throw new CodexAppServerRequestError(
          'thread/resume',
          -32602,
          'codex app-server thread/resume failed: unsupported excludeTurns parameter'
        )
      }
      return {
        thread: {
          id: 'thread-1',
          turns: [{ id: 'turn-1', items: [{ output: 'x'.repeat(16 * 1024 * 1024 + 1) }] }]
        }
      }
    })

    await expect(
      openCodexThread(
        connectionFor(request),
        { cwd: '/workspace', resumeThreadId: 'thread-1' },
        2_000
      )
    ).resolves.toMatchObject({ threadId: 'thread-1' })
    expect(request.mock.calls.filter(([method]) => method === 'thread/resume')).toHaveLength(2)
  })
})
