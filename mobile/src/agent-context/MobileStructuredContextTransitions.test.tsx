import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileStructuredContextTransitions } from './MobileStructuredContextTransitions'

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  hook: vi.fn()
}))

vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    ActivityIndicator: 'ActivityIndicator',
    Pressable: ({ children, ...props }: { children?: unknown }) =>
      React.createElement('Pressable', props, children),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: 'Text',
    View: 'View'
  }
})

vi.mock('./use-mobile-structured-context-transitions', () => ({
  useMobileStructuredContextTransitions: mocks.hook
}))

const source = {
  sessionId: 'native-1',
  workspaceId: 'workspace-1',
  providerSessionId: 'provider-1',
  ownerState: 'live' as const,
  title: 'Current work'
}

const request = {
  requestId: 'request-1',
  status: 'queued' as const,
  mode: 'compact' as const,
  reason: 'The current topic is complete.',
  continuation: 'wait-for-user' as const,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z'
}

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    cancel: mocks.cancel,
    cancelingRequestId: null,
    connectionState: 'connected',
    error: null,
    refresh: vi.fn(),
    snapshots: [
      {
        source,
        snapshot: { ...source, ownerState: 'live', requests: [request] }
      }
    ],
    sources: [source],
    supported: true,
    ...overrides
  }
}

describe('MobileStructuredContextTransitions', () => {
  let renderer: ReactTestRenderer | null = null

  beforeEach(() => mocks.hook.mockReturnValue(hookState()))
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    vi.clearAllMocks()
  })

  function render(): ReactTestRenderer {
    act(() => {
      renderer = create(
        createElement(MobileStructuredContextTransitions, {
          client: null,
          connectionState: 'connected',
          hostCapabilities: [],
          sessions: [],
          worktreeId: 'workspace-1'
        })
      )
    })
    return renderer as unknown as ReactTestRenderer
  }

  function text(instance: ReactTestRenderer): string {
    return instance.root
      .findAllByType('Text')
      .map((node) => node.children.join(''))
      .join('\n')
  }

  it('shows mode, reason, progress, and pending cancellation', () => {
    const instance = render()
    expect(text(instance)).toContain('Compact context')
    expect(text(instance)).toContain('The current topic is complete.')
    expect(text(instance)).toContain('Waiting for this turn to finish')

    const cancel = instance.root.findByProps({
      accessibilityLabel: 'Cancel context change for Current work'
    })
    act(() => cancel.props.onPress())
    expect(mocks.cancel).toHaveBeenCalledWith(source, request)
  })

  it('does not offer cancellation after the host effect boundary', () => {
    mocks.hook.mockReturnValue(
      hookState({
        snapshots: [
          {
            source,
            snapshot: {
              ...source,
              ownerState: 'live',
              requests: [{ ...request, status: 'executing' }]
            }
          }
        ]
      })
    )
    const instance = render()
    expect(
      instance.root.findAllByProps({
        accessibilityLabel: 'Cancel context change for Current work'
      })
    ).toHaveLength(0)
  })

  it('keeps disconnected and unknown ownership visibly unconfirmed', () => {
    mocks.hook.mockReturnValue(
      hookState({
        connectionState: 'reconnecting',
        snapshots: [
          {
            source,
            snapshot: { ...source, ownerState: 'unverifiable', requests: [request] }
          }
        ]
      })
    )
    const instance = render()
    expect(text(instance)).toContain('Context status unavailable')
    expect(text(instance)).toContain('completion is not confirmed')
  })

  it('reports an older host explicitly and names the terminal limitation', () => {
    mocks.hook.mockReturnValue(hookState({ supported: false, snapshots: [] }))
    const instance = render()
    expect(text(instance)).toContain('Context changes unavailable')
    expect(text(instance)).toContain('Terminal context changes remain unavailable on mobile.')
  })
})
