import { describe, expect, it } from 'vitest'
import {
  SLOW_LINK_TERMINAL_SNAPSHOT_BYTE_BUDGET,
  terminalSubscribeSnapshotByteBudget
} from './use-mobile-terminal-slow-link-history'

describe('terminalSubscribeSnapshotByteBudget', () => {
  it('keeps the host default on a LAN or an unknown path', () => {
    for (const path of ['lan', null] as const) {
      expect(
        terminalSubscribeSnapshotByteBudget({ platformBudget: undefined, path, fullHistory: false })
      ).toBeUndefined()
    }
  })

  it('caps the seed on Tailscale and the relay', () => {
    for (const path of ['tailscale', 'relay'] as const) {
      expect(
        terminalSubscribeSnapshotByteBudget({ platformBudget: undefined, path, fullHistory: false })
      ).toBe(SLOW_LINK_TERMINAL_SNAPSHOT_BYTE_BUDGET)
    }
  })

  it('never raises a smaller platform cap and lifts the slow-link cap on request', () => {
    expect(
      terminalSubscribeSnapshotByteBudget({
        platformBudget: 4096,
        path: 'relay',
        fullHistory: false
      })
    ).toBe(4096)
    expect(
      terminalSubscribeSnapshotByteBudget({
        platformBudget: undefined,
        path: 'relay',
        fullHistory: true
      })
    ).toBeUndefined()
  })
})
