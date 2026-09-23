import { describe, expect, it } from 'vitest'
import type { AgentSessionRecord } from '../../../../shared/agent-session-record'
import type { AgentContextTransitionRequest } from '../../../../shared/agent-context-transition'
import {
  structuredAgentContextRequests,
  structuredAgentContextScopeFor
} from './agent-context-structured-scope'

function record(): AgentSessionRecord {
  return {
    sessionId: 'codex_one',
    provider: 'codex',
    providerHandleChain: [
      { linkId: 'link-1', handle: { provider: 'codex', threadId: 'thread-1' } }
    ],
    location: { executionHostId: 'local', wslDistro: null, workspaceId: 'workspace-1' },
    lease: {
      runtimeKind: 'native',
      claimStatus: 'live',
      unreconciled: false,
      deathEvidence: null,
      provenHandleLinkId: 'link-1',
      ownerProcess: { pid: 1 }
    }
  } as AgentSessionRecord
}

describe('structured agent context scope', () => {
  it('derives the provider and workspace only from the exact host-owned structured record', () => {
    expect(structuredAgentContextScopeFor(record(), 'codex_one')).toEqual({
      sessionId: 'codex_one',
      workspaceId: 'workspace-1',
      providerSessionId: 'thread-1',
      ownerState: 'live'
    })
    expect(() => structuredAgentContextScopeFor(record(), 'codex_other')).toThrow('unverifiable')
    expect(() =>
      structuredAgentContextScopeFor(
        {
          ...record(),
          location: { ...record().location, wslDistro: 'Ubuntu' }
        },
        'codex_one'
      )
    ).toThrow('unverifiable')
    expect(() =>
      structuredAgentContextScopeFor(
        {
          ...record(),
          location: { ...record().location, executionHostId: 'ssh:other' }
        },
        'codex_one'
      )
    ).toThrow('unverifiable')
  })

  it('keeps contact loss distinct from positive process exit', () => {
    const live = record()
    expect(
      structuredAgentContextScopeFor(
        {
          ...live,
          lease: { ...live.lease, unreconciled: true }
        },
        'codex_one'
      ).ownerState
    ).toBe('unverifiable')
    expect(
      structuredAgentContextScopeFor(
        {
          ...live,
          lease: {
            ...live.lease,
            claimStatus: 'released',
            deathEvidence: { kind: 'exit-observed', detail: 'exit', observedAt: 1 }
          }
        },
        'codex_one'
      ).ownerState
    ).toBe('exited')
  })

  it('filters terminal and other-session requests even under the same provider thread', () => {
    const requests = [
      { requestId: 'owned', target: { sessionId: 'codex_one' } },
      { requestId: 'terminal', target: { terminalHandle: 'pty-1' } },
      { requestId: 'other', target: { sessionId: 'codex_other' } }
    ] as AgentContextTransitionRequest[]
    expect(
      structuredAgentContextRequests(requests, 'codex_one').map((item) => item.requestId)
    ).toEqual(['owned'])
  })
})
