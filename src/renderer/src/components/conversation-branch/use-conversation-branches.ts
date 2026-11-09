// The branches of one workspace, shared by every chat and panel showing it. Read from the host
// that owns the transcripts; refreshed after a branch is made and when a reader mounts.

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ConversationBranchRecord } from '../../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  listConversationBranches,
  supportsConversationBranches
} from '@/runtime/conversation-branch-client'

type Entry = {
  supported: boolean
  branches: ConversationBranchRecord[]
  loading: Promise<void> | null
  listeners: Set<() => void>
}

const EMPTY: readonly ConversationBranchRecord[] = []
const entries = new Map<string, Entry>()

function keyOf(target: RuntimeClientTarget, worktreeId: string): string {
  return `${target.kind === 'local' ? 'local' : target.environmentId}\0${worktreeId}`
}

function entryOf(key: string): Entry {
  let entry = entries.get(key)
  if (!entry) {
    entry = { supported: false, branches: [], loading: null, listeners: new Set() }
    entries.set(key, entry)
  }
  return entry
}

/** Re-reads one workspace's branches; concurrent callers share the read. */
export function refreshConversationBranches(
  target: RuntimeClientTarget,
  worktreeId: string
): Promise<void> {
  const entry = entryOf(keyOf(target, worktreeId))
  entry.loading ??= (async () => {
    try {
      entry.supported = await supportsConversationBranches(target)
      entry.branches = entry.supported ? await listConversationBranches(target, worktreeId) : []
    } catch {
      // A failed read keeps what was shown; the next refresh retries.
    } finally {
      entry.loading = null
      for (const listener of entry.listeners) {
        listener()
      }
    }
  })()
  return entry.loading
}

export function useConversationBranches(
  target: RuntimeClientTarget,
  worktreeId: string | null
): {
  supported: boolean
  branches: readonly ConversationBranchRecord[]
  refresh: () => Promise<void>
} {
  const key = worktreeId ? keyOf(target, worktreeId) : null
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) {
        return () => {}
      }
      const entry = entryOf(key)
      entry.listeners.add(listener)
      return () => entry.listeners.delete(listener)
    },
    [key]
  )
  const branches = useSyncExternalStore(subscribe, () =>
    key ? (entries.get(key)?.branches ?? EMPTY) : EMPTY
  )
  const supported = useSyncExternalStore(subscribe, () =>
    key ? (entries.get(key)?.supported ?? false) : false
  )
  const refresh = useCallback(
    () => (worktreeId ? refreshConversationBranches(target, worktreeId) : Promise.resolve()),
    [target, worktreeId]
  )
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { supported, branches, refresh }
}
