import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../../orca-runtime'
import { settleTerminalSendInput, sendTerminalStreamInput } from './terminal-input-delivery'

function runtime(accepted = true) {
  const claim = { commit: vi.fn(async () => {}), rollback: vi.fn() }
  const host = {
    sendTerminal: vi.fn(async (_handle, _action, options) => {
      await options?.afterWrite?.('pty-1')
      return { accepted }
    }),
    beginMobileInputFloor: vi.fn(() => claim),
    recordMobileApprovalInput: vi.fn()
  }
  return { host: host as unknown as OrcaRuntimeService, claim, calls: host }
}

describe('mobile approval input attribution', () => {
  it('attributes an accepted unary send to the authenticated phone only', () => {
    const { host, calls, claim } = runtime()
    const floorClaim = { current: claim as never }
    settleTerminalSendInput(
      host,
      'pty-1',
      { accepted: true },
      { client: { type: 'mobile', id: 'phone-a' } },
      { clientId: 'phone-a', clientKind: 'mobile' },
      floorClaim
    )
    expect(calls.recordMobileApprovalInput).toHaveBeenCalledWith('pty-1', 'phone-a')
    settleTerminalSendInput(
      host,
      'pty-1',
      { accepted: false },
      { client: { type: 'mobile', id: 'phone-a' } },
      { clientId: 'phone-a', clientKind: 'mobile' },
      floorClaim
    )
    expect(claim.rollback).toHaveBeenCalled()
    expect(calls.recordMobileApprovalInput).toHaveBeenCalledTimes(1)
  })

  it('records accepted input only for the authenticated phone', async () => {
    const { host, calls } = runtime()
    await expect(
      sendTerminalStreamInput(host, {
        terminal: 'terminal-1',
        text: 'x',
        client: { type: 'mobile', id: 'phone-a' },
        isMobile: true,
        authenticatedMobileClientId: 'phone-a'
      })
    ).resolves.toBe('delivered')
    expect(calls.recordMobileApprovalInput).toHaveBeenCalledWith('pty-1', 'phone-a')
  })

  it('clears provenance for a spoofed mobile client or desktop write', async () => {
    const { host, calls } = runtime()
    await sendTerminalStreamInput(host, {
      terminal: 'terminal-1',
      text: 'x',
      client: { type: 'mobile', id: 'phone-a' },
      isMobile: true,
      authenticatedMobileClientId: 'phone-b'
    })
    expect(calls.recordMobileApprovalInput).toHaveBeenLastCalledWith('pty-1', null)
    await sendTerminalStreamInput(host, {
      terminal: 'terminal-1',
      text: 'x',
      client: { type: 'desktop', id: 'desktop-a' },
      isMobile: false
    })
    expect(calls.recordMobileApprovalInput).toHaveBeenLastCalledWith('pty-1', null)
  })

  it('does not grant approval on rejected writes', async () => {
    const { host, calls } = runtime(false)
    await expect(
      sendTerminalStreamInput(host, {
        terminal: 'terminal-1',
        text: 'x',
        client: { type: 'mobile', id: 'phone-a' },
        isMobile: true,
        authenticatedMobileClientId: 'phone-a'
      })
    ).resolves.toBe('rejected')
    expect(calls.recordMobileApprovalInput).not.toHaveBeenCalled()
  })
})
