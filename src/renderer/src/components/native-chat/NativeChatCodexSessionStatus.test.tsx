// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionStatusSummary } from '../../../../shared/agent-session-wire'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

const mocks = vi.hoisted(() => ({
  summary: null as AgentSessionStatusSummary | null,
  useSummary: vi.fn()
}))
vi.mock('./StructuredAgentSessionStatusBridge', () => ({
  useStructuredAgentSessionStatusSummary: (...args: unknown[]) => {
    mocks.useSummary(...args)
    return mocks.summary
  }
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  getActiveRuntimeTarget: ({
    activeRuntimeEnvironmentId
  }: {
    activeRuntimeEnvironmentId?: string
  }) =>
    activeRuntimeEnvironmentId
      ? { kind: 'environment', environmentId: activeRuntimeEnvironmentId }
      : { kind: 'local' }
}))
vi.mock('./NativeChatCodexStatus', () => ({
  NativeChatCodexStatus: ({ weeklyUsedPercent }: { weeklyUsedPercent?: number }) => (
    <span>
      {weeklyUsedPercent === undefined ? 'weekly —' : `weekly ${100 - weeklyUsedPercent}% left`}
    </span>
  )
}))

import { NativeChatCodexSessionStatus } from './NativeChatCodexSessionStatus'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  mocks.summary = null
})

describe('Codex composer status source', () => {
  it('reads the selected session on its execution host instead of a global account', () => {
    const transport = {
      sessionId: 'session-a',
      runtimeEnvironmentId: 'remote-a'
    } as NativeChatStructuredComposerTransport
    mocks.summary = {
      sessionId: 'session-a',
      workspaceId: 'folder-a',
      agent: 'codex',
      status: 'working',
      latestPrompt: '',
      updatedAt: 1,
      codexWeeklyUsage: { usedPercent: 59 }
    }
    const { rerender } = render(
      <NativeChatCodexSessionStatus transport={transport} codexWeeklyUsage={{ usedPercent: 10 }} />
    )
    expect(mocks.useSummary).toHaveBeenLastCalledWith('session-a', {
      kind: 'environment',
      environmentId: 'remote-a'
    })
    expect(screen.getByText('weekly 41% left')).toBeTruthy()
    mocks.summary = null
    rerender(
      <NativeChatCodexSessionStatus
        transport={{ ...transport, sessionId: 'session-b', runtimeEnvironmentId: 'remote-b' }}
      />
    )
    expect(mocks.useSummary).toHaveBeenLastCalledWith('session-b', {
      kind: 'environment',
      environmentId: 'remote-b'
    })
    expect(screen.getByText('weekly —')).toBeTruthy()
  })

  it('expires the last weekly snapshot at reset without inventing a fresh allowance', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_900_000_000_000)
    render(
      <NativeChatCodexSessionStatus
        codexWeeklyUsage={{ usedPercent: 59, resetsAt: 1_900_000_010_000 }}
      />
    )
    expect(screen.getByText('weekly 41% left')).toBeTruthy()
    act(() => vi.advanceTimersByTime(10_001))
    expect(screen.getByText('weekly —')).toBeTruthy()
  })
})
