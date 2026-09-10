import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionOwnerProbe } from '../../shared/agent-session-lease-adjudication'
import {
  stopStructuredTerminalChild,
  waitForStructuredTerminalChildExit
} from './structured-terminal-child-stop'

const identity = { hostId: 'local', pid: 202, processStartTimeMs: 1000, spawnToken: 'child-token' }
const matched: AgentSessionOwnerProbe = {
  outcome: 'identity-matched',
  matchedOn: ['process-start-time']
}

describe('stopping an adopted terminal child', () => {
  it('signals only the exact child and waits for positive exit proof', async () => {
    const probe = vi
      .fn<() => Promise<AgentSessionOwnerProbe>>()
      .mockResolvedValueOnce(matched)
      .mockResolvedValueOnce(matched)
      .mockResolvedValue({ outcome: 'pid-absent' })
    const signal = vi.fn()
    const sleep = vi.fn(async () => undefined)
    await stopStructuredTerminalChild(identity, { probe, signal, sleep })
    expect(signal.mock.calls).toEqual([[202, 'SIGTERM']])
    expect(probe).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('never signals a PID when its identity is unverifiable', async () => {
    const signal = vi.fn()
    await expect(
      stopStructuredTerminalChild(identity, {
        probe: async () => ({ outcome: 'indeterminate', reason: 'unavailable' }),
        signal
      })
    ).rejects.toThrow('could not be stopped safely')
    expect(signal).not.toHaveBeenCalled()
  })

  it('does not mistake a stop request or a PID lookup failure for exit', async () => {
    let now = 0
    await expect(
      waitForStructuredTerminalChildExit(identity, 100, {
        probe: async () => ({ outcome: 'indeterminate', reason: 'unavailable' }),
        now: () => now,
        sleep: async (ms) => {
          now += ms
        }
      })
    ).rejects.toThrow('could not be proven stopped')
  })

  it('reproves identity before escalating a timed out graceful stop', async () => {
    let now = 0
    const signal = vi.fn()
    const probe = vi.fn(async (): Promise<AgentSessionOwnerProbe> =>
      now >= 15000 ? { outcome: 'identity-mismatch', field: 'process-start-time' } : matched
    )
    await stopStructuredTerminalChild(identity, {
      probe,
      signal,
      now: () => now,
      sleep: async (ms) => {
        now += ms
      }
    })
    expect(signal.mock.calls).toEqual([[202, 'SIGTERM']])
  })
})
