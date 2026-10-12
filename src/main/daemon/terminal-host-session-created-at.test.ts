import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from './session'
import {
  recordTerminalHostSessionCreatedAt,
  terminalHostSessionCreatedAt
} from './terminal-host-session-created-at'

describe('terminal host session creation time', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('records the creation time once and reports unknown sessions as zero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(123_456)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the WeakMap only keys on identity.
    const session = {} as Session
    expect(terminalHostSessionCreatedAt(session)).toBe(0)

    recordTerminalHostSessionCreatedAt(session)

    expect(terminalHostSessionCreatedAt(session)).toBe(123_456)
  })
})
