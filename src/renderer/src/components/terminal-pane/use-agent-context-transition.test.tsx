// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodexConversationContinuationSource } from './codex-conversation-continuation-source'
import { useAgentContextTransition } from './use-agent-context-transition'

const surface = vi.hoisted(() => ({
  read: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn()
}))

vi.mock('./agent-context-terminal-surface-client', () => ({
  readAgentContextTerminalSurface: surface.read,
  claimAgentContextTerminalSurface: surface.claim,
  completeAgentContextTerminalSurface: surface.complete
}))

const source: CodexConversationContinuationSource = {
  paneId: 1,
  paneKey: 'tab:leaf',
  providerSessionId: 'source-thread',
  transcriptPath: '/sessions/source.jsonl',
  workspaceId: 'workspace-1',
  target: { kind: 'local' }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('useAgentContextTransition', () => {
  it('reports a claimed offer when its pane effect is disposed before the claim returns', async () => {
    let resolveClaim!: (claim: { claimId: string }) => void
    surface.read.mockResolvedValue({
      requestId: 'request-1',
      mode: 'compacted',
      candidate: { providerSessionId: 'replacement-thread' }
    })
    surface.claim.mockReturnValue(
      new Promise<{ claimId: string }>((resolve) => {
        resolveClaim = resolve
      })
    )
    surface.complete.mockResolvedValue(undefined)
    const restart = vi.fn(async () => {})
    const hook = renderHook(
      ({ currentSource }) =>
        useAgentContextTransition({
          source: currentSource,
          enabled: true,
          restartCodexConversationPane: restart
        }),
      { initialProps: { currentSource: source as CodexConversationContinuationSource | null } }
    )

    await waitFor(() => expect(surface.claim).toHaveBeenCalledOnce())
    hook.rerender({ currentSource: null })
    await act(async () => resolveClaim({ claimId: 'claim-1' }))

    expect(surface.complete).toHaveBeenCalledExactlyOnceWith(source.target, {
      requestId: 'request-1',
      claimId: 'claim-1',
      result: { status: 'failed', error: 'agent_context_surface_owner_changed' }
    })
    expect(restart).not.toHaveBeenCalled()
  })
})
