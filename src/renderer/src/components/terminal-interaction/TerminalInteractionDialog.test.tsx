// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoutedTerminalInteractionRequest } from './use-terminal-interaction-requests'

const mocks = vi.hoisted(() => ({
  requests: [] as RoutedTerminalInteractionRequest[],
  respond: vi.fn()
}))

vi.mock('./use-terminal-interaction-requests', () => ({
  useTerminalInteractionRequests: () => ({
    requests: mocks.requests,
    respond: mocks.respond
  })
}))

import { TerminalInteractionDialog } from './TerminalInteractionDialog'

function pending(
  requestId: string,
  title: string,
  target: RoutedTerminalInteractionRequest['target'] = { kind: 'local' },
  createdAt = 1
): RoutedTerminalInteractionRequest {
  const ownerKey = target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
  return {
    requestId,
    terminalHandle: `terminal-${requestId}`,
    paneKey: `pane-${requestId}`,
    request: {
      title,
      fields: [{ id: 'answer', type: 'text', label: 'Answer', required: true }]
    },
    createdAt,
    target,
    targetKey: ownerKey,
    key: `${ownerKey}:${requestId}`
  }
}

describe('TerminalInteractionDialog', () => {
  beforeEach(() => {
    mocks.requests = []
    mocks.respond.mockReset()
    mocks.respond.mockResolvedValue(undefined)
  })

  afterEach(cleanup)

  it('pages pending requests while preserving each draft', async () => {
    const user = userEvent.setup()
    mocks.requests = [pending('first', 'First request'), pending('second', 'Second request')]
    render(<TerminalInteractionDialog />)

    await user.type(screen.getByRole('textbox', { name: /Answer/ }), 'alpha')
    await user.click(screen.getByRole('button', { name: 'Next request' }))
    expect(screen.getByText('Second request')).toBeTruthy()
    expect(screen.getByText('2 / 2')).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: /Answer/ }), 'beta')

    await user.click(screen.getByRole('button', { name: 'Previous request' }))
    expect((screen.getByRole('textbox', { name: /Answer/ }) as HTMLInputElement).value).toBe(
      'alpha'
    )
    await user.click(screen.getByRole('button', { name: 'Next request' }))
    expect((screen.getByRole('textbox', { name: /Answer/ }) as HTMLInputElement).value).toBe('beta')
  })

  it('submits only the active request through its original target and blocks duplicates', async () => {
    const user = userEvent.setup()
    let resolveResponse: (() => void) | undefined
    mocks.respond.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveResponse = resolve
        })
    )
    const remote = pending(
      'remote',
      'Remote request',
      { kind: 'environment', environmentId: 'hub-1' },
      2
    )
    mocks.requests = [pending('local', 'Local request'), remote]
    render(<TerminalInteractionDialog />)

    await user.click(screen.getByRole('button', { name: 'Next request' }))
    await user.type(screen.getByRole('textbox', { name: /Answer/ }), 'remote answer')
    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
    await user.click(submit)
    expect(submit.disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Previous request' }) as HTMLButtonElement).disabled
    ).toBe(true)
    await user.click(submit)

    expect(mocks.respond).toHaveBeenCalledTimes(1)
    expect(mocks.respond).toHaveBeenCalledWith(remote, {
      status: 'submitted',
      values: { answer: 'remote answer' }
    })
    resolveResponse?.()
  })

  it('always identifies the requesting terminal alongside the tool description', () => {
    mocks.requests = [
      {
        ...pending('described', 'Describe it'),
        terminalTitle: 'Build terminal',
        request: {
          title: 'Describe it',
          description: 'Choose the deployment settings.',
          fields: [{ id: 'answer', type: 'text', label: 'Answer' }]
        }
      }
    ]

    render(<TerminalInteractionDialog />)

    expect(screen.getByText('Choose the deployment settings.')).toBeTruthy()
    expect(screen.getByText('Requested by Build terminal')).toBeTruthy()
  })

  it('cancels only the active request and follows stale removal without losing the queue', async () => {
    const user = userEvent.setup()
    const first = pending('first', 'First request')
    const second = pending('second', 'Second request', { kind: 'local' }, 2)
    mocks.requests = [first, second]
    const view = render(<TerminalInteractionDialog />)

    await user.click(screen.getByRole('button', { name: 'Next request' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.respond).toHaveBeenCalledWith(second, { status: 'cancelled' })

    mocks.respond.mockClear()
    mocks.requests = [first]
    view.rerender(<TerminalInteractionDialog />)
    expect(await screen.findByText('First request')).toBeTruthy()
    expect(mocks.respond).not.toHaveBeenCalled()
  })
})
