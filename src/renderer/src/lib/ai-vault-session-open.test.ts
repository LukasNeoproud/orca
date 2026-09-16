import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import { openAiVaultSession, type AiVaultSessionOpenDeps } from './ai-vault-session-open'

function session(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'local:codex:provider-1',
    executionHostId: 'local',
    agent: 'codex',
    sessionId: 'provider-1',
    title: 'Session',
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: '/history/provider-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-09-15T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume provider-1',
    subagent: null,
    ...overrides
  }
}

function deps(overrides: Partial<AiVaultSessionOpenDeps> = {}): AiVaultSessionOpenDeps {
  return {
    activateRemembered: vi.fn(() => false),
    activateExistingTerminal: vi.fn(() => null),
    activateExistingStructured: vi.fn(async () => undefined),
    classifyRemembered: vi.fn(() => 'live' as const),
    ownershipUnverifiable: vi.fn(),
    openTerminal: vi.fn(async () => null),
    openStructured: vi.fn(async () => null),
    ...overrides
  }
}

describe('openAiVaultSession', () => {
  it.each(['terminal', 'structured'] as const)(
    'activates a live owner in its existing surface for a requested %s open',
    async (mode) => {
      const parts = deps()
      const owned = session({
        structuredSession: {
          sessionId: 'structured-1',
          workspaceId: 'workspace-1',
          ownerState: 'live'
        }
      })

      await openAiVaultSession(owned, mode, 'other-workspace', parts)

      expect(parts.activateExistingStructured).toHaveBeenCalledWith(owned)
      expect(parts.openTerminal).not.toHaveBeenCalled()
      expect(parts.openStructured).not.toHaveBeenCalled()
    }
  )

  it('blocks an unverifiable owner without starting a second writer', async () => {
    const parts = deps()
    const uncertain = session({
      structuredSession: {
        sessionId: 'structured-1',
        workspaceId: 'workspace-1',
        ownerState: 'unverifiable'
      }
    })

    await openAiVaultSession(uncertain, 'terminal', undefined, parts)

    expect(parts.ownershipUnverifiable).toHaveBeenCalledWith(uncertain)
    expect(parts.activateExistingStructured).not.toHaveBeenCalled()
    expect(parts.openTerminal).not.toHaveBeenCalled()
  })

  it('activates an existing terminal before considering the requested mode', async () => {
    const parts = deps({ activateExistingTerminal: vi.fn(() => 'live' as const) })
    const historical = session()

    await openAiVaultSession(historical, 'structured', 'workspace-1', parts)

    expect(parts.activateExistingTerminal).toHaveBeenCalledWith(historical)
    expect(parts.openStructured).not.toHaveBeenCalled()
    expect(parts.openTerminal).not.toHaveBeenCalled()
  })

  it('routes released history rows to the explicit requested mode', async () => {
    const parts = deps()
    const historical = session()

    await openAiVaultSession(historical, 'structured', 'workspace-2', parts)

    expect(parts.openStructured).toHaveBeenCalledWith(historical, 'workspace-2')
    expect(parts.openTerminal).not.toHaveBeenCalled()
  })

  it('deduplicates an in-flight open', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const parts = deps({
      openTerminal: vi.fn(async () => {
        await pending
        return null
      })
    })
    const historical = session()

    const first = openAiVaultSession(historical, 'terminal', 'workspace-1', parts)
    const second = openAiVaultSession(
      { ...historical, id: 'refreshed-row', filePath: '/moved/provider-1.jsonl' },
      'structured',
      undefined,
      parts
    )
    expect(first).toBe(second)
    expect(parts.openTerminal).toHaveBeenCalledOnce()
    expect(parts.openStructured).not.toHaveBeenCalled()
    finish()
    await first
  })

  it('activates a completed terminal launch before hooks publish provider identity', async () => {
    const target = { kind: 'terminal', workspaceId: 'workspace-1', tabId: 'tab-1' } as const
    const parts = deps({
      openTerminal: vi.fn(async () => target),
      activateRemembered: vi.fn((candidate) => candidate === target)
    })
    const historical = session({ sessionId: 'sequential-terminal' })

    await openAiVaultSession(historical, 'terminal', 'workspace-1', parts)
    await openAiVaultSession(historical, 'structured', undefined, parts)

    expect(parts.openTerminal).toHaveBeenCalledOnce()
    expect(parts.openStructured).not.toHaveBeenCalled()
    expect(parts.activateRemembered).toHaveBeenCalledWith(target)
  })

  it('activates a completed structured launch even when the cached row has no pointer', async () => {
    const target = {
      kind: 'structured',
      workspaceId: 'workspace-1',
      sessionId: 'structured-1'
    } as const
    const parts = deps({
      openStructured: vi.fn(async () => target),
      activateRemembered: vi.fn((candidate) => candidate === target)
    })
    const historical = session({ sessionId: 'sequential-structured' })

    await openAiVaultSession(historical, 'structured', 'workspace-1', parts)
    await openAiVaultSession(historical, 'terminal', 'workspace-1', parts)

    expect(parts.openStructured).toHaveBeenCalledOnce()
    expect(parts.openTerminal).not.toHaveBeenCalled()
    expect(parts.activateRemembered).toHaveBeenCalledWith(target)
  })

  it('clears a remembered surface only after an authoritative exited verdict', async () => {
    const target = {
      kind: 'structured',
      workspaceId: 'workspace-1',
      sessionId: 'structured-stale'
    } as const
    const parts = deps({
      openStructured: vi.fn(async () => target),
      openTerminal: vi.fn(async () => null),
      activateRemembered: vi.fn(() => true),
      classifyRemembered: vi.fn(() => 'exited' as const)
    })
    const historical = session({ sessionId: 'refreshed-exit' })

    await openAiVaultSession(historical, 'structured', 'workspace-1', parts)
    await openAiVaultSession(historical, 'terminal', 'workspace-1', parts)

    expect(parts.activateRemembered).not.toHaveBeenCalled()
    expect(parts.openTerminal).toHaveBeenCalledOnce()
  })

  it('does not admit a second writer when remembered ownership is unverifiable', async () => {
    const target = {
      kind: 'structured',
      workspaceId: 'workspace-1',
      sessionId: 'structured-observed'
    } as const
    const parts = deps({
      openStructured: vi.fn(async () => target),
      openTerminal: vi.fn(async () => null),
      activateRemembered: vi.fn(() => false),
      classifyRemembered: vi.fn(() => 'unverifiable' as const)
    })
    const historical = session({ sessionId: 'observed-exit' })

    await openAiVaultSession(historical, 'structured', 'workspace-1', parts)
    await openAiVaultSession(historical, 'terminal', 'workspace-1', parts)

    expect(parts.activateRemembered).toHaveBeenCalledWith(target)
    expect(parts.ownershipUnverifiable).toHaveBeenCalledWith(historical)
    expect(parts.openTerminal).not.toHaveBeenCalled()
  })
})
