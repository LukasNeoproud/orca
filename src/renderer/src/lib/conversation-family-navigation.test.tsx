// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionExecutionLocation } from '../../../shared/agent-session-record'

const mocks = vi.hoisted(() => ({ activate: vi.fn() }))

vi.mock('./workspace-conversation-activation', () => ({
  activateStructuredConversation: mocks.activate
}))

import {
  consumeConversationAnchorRequest,
  navigateRelatedConversation,
  useConversationAnchorRequest
} from './conversation-family-navigation'

const location = {
  workspaceId: 'workspace',
  executionHostId: 'local',
  wslDistro: null,
  workspaceKind: 'folder'
} as AgentSessionExecutionLocation
const anchor = { epoch: 'epoch', itemId: 'item' }

describe('conversation family navigation', () => {
  beforeEach(() => {
    mocks.activate.mockReset()
    mocks.activate.mockResolvedValue('activated')
  })

  it('publishes an anchor once and consumes it after the destination observes it', async () => {
    const target = { kind: 'local' } as const
    const view = renderHook(() => useConversationAnchorRequest(target, 'session'))

    await navigateRelatedConversation(target, 'session', location, anchor)
    await waitFor(() => expect(view.result.current).toMatchObject(anchor))
    const request = view.result.current!
    consumeConversationAnchorRequest(target, 'session', request.sequence)
    await waitFor(() => expect(view.result.current).toBeNull())
  })

  it('reissues the same source anchor with a fresh sequence', async () => {
    const target = { kind: 'local' } as const
    const view = renderHook(() => useConversationAnchorRequest(target, 'repeat-session'))

    await navigateRelatedConversation(target, 'repeat-session', location, anchor)
    const first = view.result.current!
    consumeConversationAnchorRequest(target, 'repeat-session', first.sequence)
    await navigateRelatedConversation(target, 'repeat-session', location, anchor)
    await waitFor(() => expect(view.result.current?.sequence).toBeGreaterThan(first.sequence))
  })

  it('keeps requests isolated by runtime scope', async () => {
    const local = { kind: 'local' } as const
    const remote = { kind: 'environment', environmentId: 'runtime-a' } as const
    const localView = renderHook(() => useConversationAnchorRequest(local, 'same-session'))
    const remoteView = renderHook(() => useConversationAnchorRequest(remote, 'same-session'))

    await navigateRelatedConversation(remote, 'same-session', location, anchor)
    await waitFor(() => expect(remoteView.result.current).toMatchObject(anchor))
    expect(localView.result.current).toBeNull()
    expect(mocks.activate).toHaveBeenCalledWith(
      expect.objectContaining({
        executionHostId: 'runtime:runtime-a',
        runtimeEnvironmentId: 'runtime-a'
      }),
      'same-session'
    )
  })

  it('does not publish or retry locally when the remote owner is unverifiable', async () => {
    const remote = { kind: 'environment', environmentId: 'runtime-b' } as const
    const view = renderHook(() => useConversationAnchorRequest(remote, 'unverifiable-session'))
    mocks.activate.mockResolvedValueOnce('unverifiable')

    await expect(
      navigateRelatedConversation(remote, 'unverifiable-session', location, anchor)
    ).rejects.toThrow('owner cannot currently be verified')
    expect(view.result.current).toBeNull()
    expect(mocks.activate).toHaveBeenCalledOnce()
    expect(mocks.activate).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeEnvironmentId: 'runtime-b' }),
      'unverifiable-session'
    )
  })
})
