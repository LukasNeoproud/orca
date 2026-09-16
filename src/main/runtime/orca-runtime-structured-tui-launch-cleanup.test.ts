import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import type { StructuredAgentSessionHandoffTransport } from '../native-chat/agent-session-wire/structured-agent-session-handoff-types'
import { StructuredTuiLaunchCleanupError } from '../native-chat/agent-session-wire/structured-agent-session-handoff-types'

function harness() {
  const runtime = new OrcaRuntimeService()
  const terminal = {
    handle: 'term_new',
    tabId: 'tab-new',
    paneKey: 'tab-new:leaf',
    ptyId: 'pty-new'
  }
  const ensure = vi.spyOn(runtime, 'ensureAgentSession').mockResolvedValue({
    disposition: 'created',
    terminal: terminal as never
  })
  const close = vi.spyOn(runtime, 'closeTerminal').mockResolvedValue(undefined as never)
  const exit = vi.fn(async () => {})
  const pty = { ...terminal, launchToken: 'spawn-token' }
  const internal = runtime as unknown as {
    createStructuredAgentSessionHandoffTransport(): StructuredAgentSessionHandoffTransport
    ptysById: Map<string, typeof pty>
    waitForStructuredTuiPtyExit: typeof exit
  }
  internal.ptysById.set(terminal.ptyId, pty)
  internal.waitForStructuredTuiPtyExit = exit
  const launch = () =>
    internal.createStructuredAgentSessionHandoffTransport().launchTui({
      record: {
        sessionId: 'codex_test',
        location: { workspaceId: 'workspace', executionHostId: 'local' },
        accountHome: { path: '/tmp/codex' },
        providerHandleChain: [{ handle: { provider: 'codex', threadId: 'thread' } }]
      } as never,
      fence: 5,
      spawnToken: 'spawn-token'
    })
  return { ensure, close, exit, pty, terminal, launch, ptysById: internal.ptysById }
}

describe('structured TUI launch cleanup before process identity', () => {
  it('proves exit of its own fresh PTY even when the spawn reply has no PID', async () => {
    const { launch, close, exit } = harness()
    await expect(launch()).rejects.toThrow(
      'The resumed terminal did not publish a process identity.'
    )
    expect(close).toHaveBeenCalledExactlyOnceWith('term_new')
    expect(exit).toHaveBeenCalledExactlyOnceWith('pty-new')
  })

  it('checks exit without closing a handle when the fresh PTY has already disappeared', async () => {
    const { launch, close, exit, ptysById } = harness()
    ptysById.clear()
    await expect(launch()).rejects.toThrow(
      'The resumed terminal did not publish a process identity.'
    )
    expect(close).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledExactlyOnceWith('pty-new')
  })

  it('keeps an absent PTY in manual recovery when its exit remains unverifiable', async () => {
    const { launch, close, exit, ptysById } = harness()
    ptysById.clear()
    exit.mockRejectedValue(new Error('terminal_handle_stale'))
    await expect(launch()).rejects.toBeInstanceOf(StructuredTuiLaunchCleanupError)
    expect(close).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledExactlyOnceWith('pty-new')
  })

  it.each(['adopted', 'another-launch', 'another-pane'])(
    'does not close an unrelated %s owner when the reply has no PID',
    async (mismatch) => {
      const { launch, ensure, close, exit, pty, terminal } = harness()
      if (mismatch === 'adopted') {
        ensure.mockResolvedValue({ disposition: 'adopted', terminal: terminal as never })
      } else if (mismatch === 'another-launch') {
        pty.launchToken = 'another-token'
      } else {
        pty.paneKey = 'tab-new:another-leaf'
      }
      await expect(launch()).rejects.toBeInstanceOf(StructuredTuiLaunchCleanupError)
      expect(close).not.toHaveBeenCalled()
      expect(exit).not.toHaveBeenCalled()
    }
  )

  it('retains manual recovery when the freshly launched PTY cannot be proven exited', async () => {
    const { launch, exit } = harness()
    exit.mockRejectedValue(new Error('terminal_handle_stale'))
    await expect(launch()).rejects.toBeInstanceOf(StructuredTuiLaunchCleanupError)
  })
})
