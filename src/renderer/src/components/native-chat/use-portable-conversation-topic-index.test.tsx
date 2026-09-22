// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortableConversationSource } from '../../../../shared/portable-conversation-source'
import { portableConversationSourceSessionId } from '../../../../shared/portable-conversation-branch'
import {
  readPortableConversationTopicIndex,
  writePortableConversationTopicIndex
} from '@/lib/portable-conversation-topic-client'
import { usePortableConversationTopicIndex } from './use-portable-conversation-topic-index'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
vi.mock('@/lib/window-visibility-timeout-poller', () => ({
  installWindowVisibilityTimeoutPoller: vi.fn(() => vi.fn())
}))

vi.mock('@/lib/portable-conversation-topic-client', () => ({
  readPortableConversationTopicIndex: vi.fn(),
  writePortableConversationTopicIndex: vi.fn()
}))

const target = { kind: 'environment' as const, environmentId: 'runtime' }
const source: PortableConversationSource = {
  executionHostId: 'ssh:builder',
  workspace: { id: 'folder:remote', path: '/srv/remote', kind: 'folder' },
  provider: { agent: 'codex', sessionId: 'provider' },
  transcriptPath: '/home/ada/.codex/provider.jsonl'
}
const result = {
  index: {
    sessionId: portableConversationSourceSessionId(source),
    revision: 3,
    automatic: true,
    chapters: []
  },
  anchors: {},
  limited: true
}

describe('usePortableConversationTopicIndex', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads only when visible and continues the bounded scan explicitly', async () => {
    vi.mocked(readPortableConversationTopicIndex).mockResolvedValue(result)
    const hook = renderHook(
      ({ visible }) => usePortableConversationTopicIndex({ target, source, visible }),
      {
        initialProps: { visible: false }
      }
    )
    expect(readPortableConversationTopicIndex).not.toHaveBeenCalled()
    expect(hook.result.current.index.sessionId).toBe(portableConversationSourceSessionId(source))

    hook.rerender({ visible: true })
    await waitFor(() => expect(hook.result.current.limited).toBe(true))
    expect(readPortableConversationTopicIndex).toHaveBeenCalledWith(target, {
      source,
      autoRefresh: true
    })
    await act(() => hook.result.current.loadMore())
    expect(readPortableConversationTopicIndex).toHaveBeenLastCalledWith(target, {
      source,
      refresh: true
    })
  })

  it('writes manual changes with the loaded revision and adopts the host result', async () => {
    vi.mocked(readPortableConversationTopicIndex).mockResolvedValue(result)
    vi.mocked(writePortableConversationTopicIndex).mockResolvedValue({
      ...result,
      index: { ...result.index, revision: 4, automatic: false }
    })
    const hook = renderHook(() =>
      usePortableConversationTopicIndex({ target, source, visible: true })
    )
    await waitFor(() => expect(hook.result.current.index.revision).toBe(3))

    await act(() => hook.result.current.save({ ...hook.result.current.index, automatic: false }))
    expect(writePortableConversationTopicIndex).toHaveBeenCalledWith(target, {
      source,
      expectedRevision: 3,
      index: { ...result.index, automatic: false }
    })
    expect(hook.result.current.index.revision).toBe(4)
  })
  it('refreshes once for each new verified observation while the panel stays open', async () => {
    vi.mocked(readPortableConversationTopicIndex).mockResolvedValue(result)
    const hook = renderHook(
      ({ observationKey }) =>
        usePortableConversationTopicIndex({
          target,
          source,
          visible: true,
          observationKey
        }),
      { initialProps: { observationKey: null as string | null } }
    )
    await waitFor(() => expect(hook.result.current.index.revision).toBe(3))
    hook.rerender({ observationKey: 'completed-answer-1' })
    await waitFor(() => expect(readPortableConversationTopicIndex).toHaveBeenCalledTimes(2))
    hook.rerender({ observationKey: 'completed-answer-1' })
    expect(readPortableConversationTopicIndex).toHaveBeenCalledTimes(2)
    hook.rerender({ observationKey: 'completed-answer-2' })
    await waitFor(() => expect(readPortableConversationTopicIndex).toHaveBeenCalledTimes(3))
    expect(readPortableConversationTopicIndex).toHaveBeenLastCalledWith(target, {
      source,
      autoRefresh: true
    })
  })

  it('does not rescan automatic-off history for newly observed messages', async () => {
    vi.mocked(readPortableConversationTopicIndex).mockResolvedValue({
      ...result,
      index: { ...result.index, automatic: false }
    })
    const hook = renderHook(
      ({ observationKey }) =>
        usePortableConversationTopicIndex({
          target,
          source,
          visible: true,
          observationKey
        }),
      { initialProps: { observationKey: 'first' } }
    )
    await waitFor(() => expect(hook.result.current.index.automatic).toBe(false))
    hook.rerender({ observationKey: 'next' })
    expect(readPortableConversationTopicIndex).toHaveBeenCalledTimes(1)
  })
  it('checks the visible automatic index for new turns at a bounded cadence', async () => {
    vi.mocked(readPortableConversationTopicIndex).mockResolvedValue(result)
    const hook = renderHook(() =>
      usePortableConversationTopicIndex({ target, source, visible: true })
    )
    await waitFor(() => expect(hook.result.current.index.revision).toBe(3))
    const poll = vi.mocked(installWindowVisibilityTimeoutPoller).mock.calls.at(-1)![0]
    expect(poll.getDelayMs()).toBe(15_000)
    await act(async () => {
      await poll.run()
    })
    expect(readPortableConversationTopicIndex).toHaveBeenCalledTimes(2)
    vi.mocked(writePortableConversationTopicIndex).mockResolvedValue({
      ...result,
      index: { ...result.index, automatic: false, revision: 4 }
    })
    await act(() => hook.result.current.save({ ...result.index, automatic: false }))
    await act(async () => {
      await poll.run()
    })
    expect(readPortableConversationTopicIndex).toHaveBeenCalledTimes(2)
  })
})
