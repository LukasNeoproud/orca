import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import { AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import {
  cancelMobileStructuredContextTransition,
  canCancelMobileStructuredContextRequest,
  inspectMobileStructuredContextTransition,
  mobileStructuredContextSource,
  supportsMobileStructuredContextTransitions,
  type MobileStructuredContextRequest,
  type MobileStructuredContextSource
} from './mobile-structured-context-transition'

const source: MobileStructuredContextSource = {
  sessionId: 'native-1',
  workspaceId: 'workspace-1',
  providerSessionId: 'provider-1',
  ownerState: 'live',
  title: 'Current work'
}

const request: MobileStructuredContextRequest = {
  requestId: 'request-1',
  status: 'queued',
  mode: 'compact',
  reason: 'The current topic is complete.',
  continuation: 'wait-for-user',
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z'
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rpc-1',
    ok: true as const,
    result: {
      sessionId: source.sessionId,
      workspaceId: source.workspaceId,
      providerSessionId: source.providerSessionId,
      ownerState: 'live',
      requests: [request],
      ...overrides
    },
    _meta: { runtimeId: 'runtime-1' }
  }
}

function client(reply = response()) {
  return {
    sendRequest: vi.fn<RpcClient['sendRequest']>().mockResolvedValue(reply)
  }
}

describe('mobile structured context transition contract', () => {
  it('gates the flow on the dedicated structured-mobile capability', () => {
    expect(supportsMobileStructuredContextTransitions([])).toBe(false)
    expect(
      supportsMobileStructuredContextTransitions([
        AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY
      ])
    ).toBe(true)
  })

  it('derives sources only from structured Codex ownership rows', () => {
    const structured = {
      agent: 'codex',
      sessionId: 'provider-1',
      title: 'Current work',
      structuredSession: {
        sessionId: 'native-1',
        workspaceId: 'workspace-1',
        ownerState: 'live'
      }
    } satisfies Pick<AiVaultSession, 'agent' | 'sessionId' | 'structuredSession' | 'title'>

    expect(mobileStructuredContextSource(structured)).toEqual(source)
    expect(mobileStructuredContextSource({ ...structured, agent: 'claude' })).toBeNull()
    expect(
      mobileStructuredContextSource({ ...structured, structuredSession: undefined })
    ).toBeNull()
    expect(
      mobileStructuredContextSource({
        ...structured,
        structuredSession: { sessionId: 'native-1', workspaceId: 'workspace-1' }
      })
    ).toMatchObject({ ownerState: 'unverifiable' })
  })

  it('reads only an exact echoed session scope', async () => {
    const rpc = client()
    await expect(inspectMobileStructuredContextTransition(rpc, source)).resolves.toMatchObject({
      sessionId: 'native-1',
      requests: [{ requestId: 'request-1' }]
    })
    expect(rpc.sendRequest).toHaveBeenCalledWith(
      'agentContext.inspectStructured',
      { sessionId: 'native-1' },
      { timeoutMs: 15_000, budgetSpansConnect: true }
    )

    await expect(
      inspectMobileStructuredContextTransition(client(response({ sessionId: 'other' })), source)
    ).rejects.toThrow('another session')
  })

  it('cancels only host-pending request states and never mutates optimistically', async () => {
    expect(canCancelMobileStructuredContextRequest('queued')).toBe(true)
    expect(canCancelMobileStructuredContextRequest('ready')).toBe(true)
    expect(canCancelMobileStructuredContextRequest('preparing')).toBe(true)
    expect(canCancelMobileStructuredContextRequest('executing')).toBe(false)
    expect(canCancelMobileStructuredContextRequest('unconfirmed')).toBe(false)

    const rpc = client(response({ requests: [{ ...request, status: 'cancelled' }] }))
    await expect(
      cancelMobileStructuredContextTransition(rpc, source, request)
    ).resolves.toMatchObject({
      requests: [{ status: 'cancelled' }]
    })
    expect(rpc.sendRequest).toHaveBeenCalledWith(
      'agentContext.cancelStructuredPending',
      { sessionId: 'native-1', requestId: 'request-1' },
      { timeoutMs: 15_000, budgetSpansConnect: true }
    )

    const late = client()
    await expect(
      cancelMobileStructuredContextTransition(late, source, { ...request, status: 'executing' })
    ).rejects.toThrow('can no longer')
    expect(late.sendRequest).not.toHaveBeenCalled()
  })
})
