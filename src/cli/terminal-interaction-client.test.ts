import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClientError } from './runtime-client'
import { requestTerminalInteraction } from './terminal-interaction-client'

const originalEnvironment = { ...process.env }
const request = { fields: [{ id: 'confirm', type: 'boolean' as const, label: 'Continue?' }] }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnvironment)
})

describe('terminal interaction client', () => {
  it('hands a pending request through waits and returns only the raw interaction result', async () => {
    process.env.ORCA_TERMINAL_HANDLE = 'terminal-current'
    process.env.ORCA_PANE_KEY = 'pane-current'
    const call = vi
      .fn()
      .mockResolvedValueOnce({ result: { requestId: 'request-1', status: 'pending' } })
      .mockResolvedValueOnce({
        result: {
          requestId: 'request-1',
          status: 'completed',
          result: { status: 'submitted', values: { confirm: true } }
        }
      })

    await expect(
      requestTerminalInteraction({ call } as never, request, { requestId: 'request-1' })
    ).resolves.toEqual({ status: 'submitted', values: { confirm: true } })
    expect(call).toHaveBeenNthCalledWith(1, 'terminalInteraction.request', {
      caller: { terminalHandle: 'terminal-current', paneKey: 'pane-current' },
      requestId: 'request-1',
      request
    })
    expect(call).toHaveBeenNthCalledWith(
      2,
      'terminalInteraction.wait',
      {
        caller: { terminalHandle: 'terminal-current', paneKey: 'pane-current' },
        requestId: 'request-1',
        timeoutMs: 25_000
      },
      { timeoutMs: 35_000 }
    )
  })

  it('cancels the backend request when the caller aborts an active wait', async () => {
    process.env.ORCA_TERMINAL_HANDLE = 'terminal-current'
    process.env.ORCA_PANE_KEY = 'pane-current'
    const controller = new AbortController()
    const call = vi.fn((method: string) => {
      if (method === 'terminalInteraction.request') {
        return Promise.resolve({ result: { requestId: 'request-2', status: 'pending' } })
      }
      if (method === 'terminalInteraction.wait') {
        return new Promise(() => {})
      }
      return Promise.resolve({ result: { requestId: 'request-2', status: 'completed' } })
    })
    const pending = requestTerminalInteraction({ call } as never, request, {
      requestId: 'request-2',
      signal: controller.signal
    })
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(2))
    controller.abort()

    await expect(pending).rejects.toThrow('cancelled by the caller')
    expect(call).toHaveBeenLastCalledWith(
      'terminalInteraction.cancel',
      {
        caller: { terminalHandle: 'terminal-current', paneKey: 'pane-current' },
        requestId: 'request-2'
      },
      { timeoutMs: 5_000 }
    )
  })

  it('retries a saturated long-poll slot without abandoning the interaction', async () => {
    process.env.ORCA_TERMINAL_HANDLE = 'terminal-current'
    process.env.ORCA_PANE_KEY = 'pane-current'
    const call = vi
      .fn()
      .mockResolvedValueOnce({ result: { requestId: 'request-3', status: 'pending' } })
      .mockRejectedValueOnce(new RuntimeClientError('runtime_busy', 'Long-poll slots are busy.'))
      .mockResolvedValueOnce({
        result: {
          requestId: 'request-3',
          status: 'completed',
          result: { status: 'cancelled' }
        }
      })

    await expect(
      requestTerminalInteraction({ call } as never, request, { requestId: 'request-3' })
    ).resolves.toEqual({ status: 'cancelled' })
    expect(
      call.mock.calls.filter(([method]) => method === 'terminalInteraction.wait')
    ).toHaveLength(2)
    expect(call.mock.calls.some(([method]) => method === 'terminalInteraction.cancel')).toBe(false)
  })
})
