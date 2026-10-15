import { useCallback, useMemo, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileConnectionPath } from '../transport/stable-logical-rpc-client'
import { mobileTerminalSnapshotByteBudget } from './terminal-snapshot-byte-budget'

// Why 128 KiB: still a few hundred rows of agent output, a quarter of the host's default seed,
// which over a relayed Tailscale or Orca Relay hop is the difference between a terminal that
// paints at once and one that streams in for seconds.
export const SLOW_LINK_TERMINAL_SNAPSHOT_BYTE_BUDGET = 128 * 1024

/** Derived from constants, so it is read once rather than on every subscribe. */
const platformSnapshotByteBudget = mobileTerminalSnapshotByteBudget()

function connectionPathOf(client: RpcClient | null): MobileConnectionPath | null {
  if (!client || !('getActivePath' in client) || typeof client.getActivePath !== 'function') {
    return null
  }
  const path: unknown = client.getActivePath()
  return path === 'lan' || path === 'tailscale' || path === 'relay' ? path : null
}

export function terminalSubscribeSnapshotByteBudget(args: {
  platformBudget: number | undefined
  path: MobileConnectionPath | null
  fullHistory: boolean
}): number | undefined {
  if (args.fullHistory || args.path === null || args.path === 'lan') {
    return args.platformBudget
  }
  return Math.min(args.platformBudget ?? Infinity, SLOW_LINK_TERMINAL_SNAPSHOT_BYTE_BUDGET)
}

/** Seeds terminals with less history on slow links, and remembers which ones can load the rest. */
export function useMobileTerminalSlowLinkHistory(args: {
  client: RpcClient | null
  showToast: (message: string, durationMs?: number) => void
}) {
  const { client, showToast } = args
  const fullHistoryHandlesRef = useRef(new Set<string>())
  const slowLinkBudgetHandlesRef = useRef(new Set<string>())
  const announcedRef = useRef(false)
  const [trimmedHistoryHandles, setTrimmedHistoryHandles] = useState<ReadonlySet<string>>(
    () => new Set()
  )

  const setTrimmed = useCallback((handle: string, trimmed: boolean) => {
    setTrimmedHistoryHandles((current) => {
      if (current.has(handle) === trimmed) {
        return current
      }
      const next = new Set(current)
      if (trimmed) {
        next.add(handle)
      } else {
        next.delete(handle)
      }
      return next
    })
  }, [])

  const snapshotByteBudgetFor = useCallback(
    (handle: string): number | undefined => {
      const budget = terminalSubscribeSnapshotByteBudget({
        platformBudget: platformSnapshotByteBudget,
        path: connectionPathOf(client),
        fullHistory: fullHistoryHandlesRef.current.has(handle)
      })
      if (budget !== platformSnapshotByteBudget) {
        slowLinkBudgetHandlesRef.current.add(handle)
      } else {
        slowLinkBudgetHandlesRef.current.delete(handle)
      }
      return budget
    },
    [client]
  )

  const noteScrollback = useCallback(
    (handle: string, data: Readonly<Record<string, unknown>>) => {
      // Why only slow-link budgets: a platform cap trims for a frame limit no reload can lift.
      const trimmed =
        slowLinkBudgetHandlesRef.current.has(handle) && data.truncatedByByteBudget === true
      setTrimmed(handle, trimmed)
      if (trimmed && !announcedRef.current) {
        announcedRef.current = true
        showToast('Showing recent terminal output to save data. Load the rest from ⋯.', 5000)
      }
    },
    [setTrimmed, showToast]
  )

  const markFullHistory = useCallback(
    (handle: string) => {
      fullHistoryHandlesRef.current.add(handle)
      setTrimmed(handle, false)
    },
    [setTrimmed]
  )

  return useMemo(
    () => ({ trimmedHistoryHandles, snapshotByteBudgetFor, noteScrollback, markFullHistory }),
    [trimmedHistoryHandles, snapshotByteBudgetFor, noteScrollback, markFullHistory]
  )
}
