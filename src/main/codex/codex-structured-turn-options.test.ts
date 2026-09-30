import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalMessageItem } from '../../shared/agent-session-journal-types'
import { CodexAppServerRequestError } from './codex-app-server-connection'
import { ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS } from './codex-orca-interaction'
import {
  dispatchCodexTurn,
  startCodexTurn,
  type CodexTurnHost
} from './codex-structured-turn-start'
import { restoredCodexSessionOptions } from './codex-structured-session-options'

const body: AgentJournalMessageItem = {
  kind: 'message',
  role: 'user',
  blocks: [{ type: 'text', text: 'Keep my\nprepared prompt' }]
}

function host(options: Record<string, string> = {}): CodexTurnHost {
  return {
    connection: { request: vi.fn(async () => ({ turn: { id: 'turn-1' } })) },
    threadId: 'thread-1',
    cwd: '/srv/folder',
    options: restoredCodexSessionOptions(options),
    turnIdWaiters: []
  }
}

describe('Codex next-turn settings', () => {
  it('freezes generation settings before the request can observe a later option change', async () => {
    const session = host({ model: 'response-model', serviceTier: 'priority' })
    session.connection.request = vi.fn(async () => {
      session.options.set('model', 'next-model')
      session.options.set('serviceTier', 'default')
      return { turn: { id: 'turn-1' } }
    })
    await dispatchCodexTurn(session, { clientMessageId: 'message-1', body }, undefined)
    expect(session.pendingTurnGenerationMetadata).toEqual({
      model: 'response-model',
      serviceTier: 'priority'
    })
    expect(session.connection.request).toHaveBeenCalledWith(
      'turn/start',
      expect.objectContaining({ model: 'response-model', serviceTier: 'priority' }),
      { timeoutMs: undefined }
    )
  })

  it('leaves provider defaults untouched before any selection', async () => {
    const session = host()
    await startCodexTurn(session, { clientMessageId: 'message-1', body })
    expect(session.connection.request).toHaveBeenCalledWith(
      'turn/start',
      {
        threadId: 'thread-1',
        clientUserMessageId: 'message-1',
        input: [{ type: 'text', text: 'Keep my\nprepared prompt' }]
      },
      { timeoutMs: undefined }
    )
    expect(vi.mocked(session.connection.request).mock.calls[0]![1]).not.toHaveProperty(
      'additionalContext'
    )
  })

  it('adds application context to every resumed turn without changing input or options', async () => {
    const session = host({ model: 'gpt-live', effort: 'high' })
    session.resumedInteractiveChat = true
    const originalBody = structuredClone(body)
    const originalOptions = [...session.options]

    await startCodexTurn(session, { clientMessageId: 'message-1', body })
    await startCodexTurn(session, { clientMessageId: 'message-2', body })

    const calls = vi.mocked(session.connection.request).mock.calls
    expect(calls).toHaveLength(2)
    for (const [index, call] of calls.entries()) {
      expect(call).toEqual([
        'turn/start',
        {
          threadId: 'thread-1',
          clientUserMessageId: `message-${index + 1}`,
          input: [{ type: 'text', text: 'Keep my\nprepared prompt' }],
          additionalContext: {
            'orca.interactive': {
              kind: 'application',
              value: ORCA_INTERACTIVE_RESUME_UI_INSTRUCTIONS
            }
          },
          model: 'gpt-live',
          effort: 'high'
        },
        { timeoutMs: undefined }
      ])
    }
    expect(body).toEqual(originalBody)
    expect([...session.options]).toEqual(originalOptions)
  })

  it('retries without application context once and caches that narrow refusal', async () => {
    const session = host({ model: 'gpt-live' })
    session.resumedInteractiveChat = true
    session.connection.request = vi.fn(async (_method, params) => {
      if (params?.additionalContext) {
        throw new CodexAppServerRequestError(
          'turn/start',
          -32602,
          'unknown field `additionalContext`'
        )
      }
      return { turn: { id: 'turn-1' } }
    })

    await startCodexTurn(session, { clientMessageId: 'message-1', body })
    await startCodexTurn(session, { clientMessageId: 'message-2', body })

    const params = vi
      .mocked(session.connection.request)
      .mock.calls.map(([, requestParams]) => requestParams)
    expect(params).toHaveLength(3)
    expect(params[0]).toHaveProperty(
      ['additionalContext', 'orca.interactive', 'kind'],
      'application'
    )
    expect(params[1]).not.toHaveProperty('additionalContext')
    expect(params[2]).not.toHaveProperty('additionalContext')
    expect(params.map((requestParams) => requestParams?.input)).toEqual([
      [{ type: 'text', text: 'Keep my\nprepared prompt' }],
      [{ type: 'text', text: 'Keep my\nprepared prompt' }],
      [{ type: 'text', text: 'Keep my\nprepared prompt' }]
    ])
  })

  it('does not retry unrelated invalid turn parameters', async () => {
    const error = new CodexAppServerRequestError('turn/start', -32602, 'invalid value for `model`')
    const session = host()
    session.resumedInteractiveChat = true
    session.connection.request = vi.fn(async () => {
      throw error
    })

    await expect(startCodexTurn(session, { clientMessageId: 'message-1', body })).rejects.toBe(
      error
    )
    expect(session.connection.request).toHaveBeenCalledOnce()
  })

  it('clears a sticky Fast mode explicitly and retains the original prompt', async () => {
    const session = host({ serviceTier: 'priority', model: 'gpt-live', effort: 'high' })
    session.supportsDefaultServiceTier = true
    await startCodexTurn(session, { clientMessageId: 'message-1', body })
    session.options.set('serviceTier', 'default')
    await startCodexTurn(session, { clientMessageId: 'message-2', body })
    expect(session.connection.request).toHaveBeenNthCalledWith(
      1,
      'turn/start',
      expect.objectContaining({
        model: 'gpt-live',
        effort: 'high',
        serviceTier: 'priority'
      }),
      { timeoutMs: undefined }
    )
    expect(session.connection.request).toHaveBeenNthCalledWith(
      2,
      'turn/start',
      expect.objectContaining({
        serviceTier: 'default',
        input: [{ type: 'text', text: 'Keep my\nprepared prompt' }]
      }),
      { timeoutMs: undefined }
    )
  })

  it('resets legacy tiers with null when model-default tiers are unavailable', async () => {
    const session = host({ serviceTier: 'default' })
    await startCodexTurn(session, { clientMessageId: 'message-1', body })
    expect(session.connection.request).toHaveBeenCalledWith(
      'turn/start',
      expect.objectContaining({ serviceTier: null }),
      { timeoutMs: undefined }
    )
  })

  it.each([
    ['read-only', 'readOnly', 'on-request', 'user'],
    ['workspace-write', 'workspaceWrite', 'on-request', 'user'],
    ['auto-review', 'workspaceWrite', 'on-request', 'auto_review'],
    ['full-access', 'dangerFullAccess', 'never', 'user']
  ])(
    'restores %s as sandbox and approval overrides',
    async (permissions, type, approvalPolicy, approvalsReviewer) => {
      const session = host({ permissions })
      await startCodexTurn(session, { clientMessageId: 'message-1', body })
      const params = vi.mocked(session.connection.request).mock.calls[0]![1]!
      expect(params).toMatchObject({
        approvalPolicy,
        approvalsReviewer,
        sandboxPolicy: { type }
      })
      expect(params).not.toHaveProperty('permissions')
      if (type === 'workspaceWrite') {
        expect(params.sandboxPolicy).toMatchObject({
          writableRoots: ['/srv/folder'],
          networkAccess: false
        })
      }
    }
  )
})
