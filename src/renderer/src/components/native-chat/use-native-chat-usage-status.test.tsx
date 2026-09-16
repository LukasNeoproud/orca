// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useNativeChatUsageStatus } from './use-native-chat-usage-status'
import { parseRuntimeNativeChatReadSessionResult } from './native-chat-runtime-contract'

afterEach(cleanup)

describe('native chat usage updates', () => {
  it('merges independent status-only appends and clears replaced/old-host snapshots', () => {
    const { result } = renderHook(() => useNativeChatUsageStatus('session-1'))
    act(() => result.current[1].replace({ contextUsage: { usedTokens: 80000, maxTokens: 258400 } }))
    act(() => result.current[1].append({ codexWeeklyUsage: { usedPercent: 59 } }))
    expect(result.current[0]).toEqual({
      contextUsage: { usedTokens: 80000, maxTokens: 258400 },
      codexWeeklyUsage: { usedPercent: 59 }
    })
    act(() => result.current[1].append(undefined))
    expect(result.current[0]?.contextUsage?.usedTokens).toBe(80000)
    act(() => result.current[1].replace(undefined))
    expect(result.current[0]).toBeUndefined()
  })

  it('never exposes a previous host/session snapshot after a rebind', () => {
    const { result, rerender } = renderHook(({ source }) => useNativeChatUsageStatus(source), {
      initialProps: { source: 'host-a/session-1' }
    })
    act(() => result.current[1].replace({ contextUsage: { usedTokens: 80000 } }))
    rerender({ source: 'host-b/session-1' })
    expect(result.current[0]).toBeUndefined()
    act(() => result.current[1].append({ codexWeeklyUsage: { usedPercent: 20 } }))
    expect(result.current[0]).toEqual({ codexWeeklyUsage: { usedPercent: 20 } })
  })

  it('marks context stale on lost contact and stops claiming current weekly usage', () => {
    const { result } = renderHook(() => useNativeChatUsageStatus('session-1'))
    act(() =>
      result.current[1].replace({
        contextUsage: { usedTokens: 80000, maxTokens: 258400 },
        codexWeeklyUsage: { usedPercent: 59 }
      })
    )
    act(() => result.current[1].markStale())
    expect(result.current[0]).toEqual({
      contextUsage: { usedTokens: 80000, maxTokens: 258400, stale: true }
    })
  })

  it('preserves usage in remote reads and accepts old hosts without metadata', () => {
    const usageStatus = {
      contextUsage: { usedTokens: 1, maxTokens: 2 },
      codexWeeklyUsage: { usedPercent: 59 }
    }
    expect(parseRuntimeNativeChatReadSessionResult({ messages: [], usageStatus })).toEqual({
      messages: [],
      usageStatus
    })
    expect(parseRuntimeNativeChatReadSessionResult({ messages: [] })).toEqual({ messages: [] })
  })
})
