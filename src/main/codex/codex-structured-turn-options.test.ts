import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalMessageItem } from '../../shared/agent-session-journal-types'
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
