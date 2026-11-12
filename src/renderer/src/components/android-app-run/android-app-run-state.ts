import { useSyncExternalStore } from 'react'
import type {
  AndroidAppRunEvent,
  AndroidAppRunPhase
} from '../../../../shared/android-app-run-types'

// Enough to read a Gradle failure without holding a whole build log per workspace.
const MAX_OUTPUT_CHARS = 60_000

export type AndroidAppRunState = {
  runId: string
  phase: AndroidAppRunPhase
  detail?: string
  output: string
}

/**
 * Run progress per workspace, kept outside React: the tab-bar button unmounts whenever its
 * pane loses focus, and a build must not lose its progress to that.
 */
const runs = new Map<string, AndroidAppRunState>()
const worktreeByRunId = new Map<string, string>()
const listeners = new Set<() => void>()
let unsubscribeEvents: (() => void) | null = null

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function isAndroidAppRunActive(state: AndroidAppRunState | undefined): boolean {
  return Boolean(state) && !['done', 'failed', 'cancelled'].includes(state!.phase)
}

export function applyAndroidAppRunEvent(event: AndroidAppRunEvent): void {
  const worktreeId = worktreeByRunId.get(event.runId)
  const current = worktreeId ? runs.get(worktreeId) : undefined
  if (!worktreeId || !current || current.runId !== event.runId) {
    return
  }
  runs.set(
    worktreeId,
    event.kind === 'output'
      ? { ...current, output: (current.output + event.text).slice(-MAX_OUTPUT_CHARS) }
      : { ...current, phase: event.phase, detail: event.detail }
  )
  notify()
}

export function beginAndroidAppRun(worktreeId: string, runId: string): void {
  unsubscribeEvents ??= window.api.androidAppRun.onEvent(applyAndroidAppRunEvent)
  const previous = runs.get(worktreeId)
  if (previous) {
    worktreeByRunId.delete(previous.runId)
  }
  worktreeByRunId.set(runId, worktreeId)
  runs.set(worktreeId, { runId, phase: 'boot', output: '' })
  notify()
}

export function useAndroidAppRunState(worktreeId: string): AndroidAppRunState | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => runs.get(worktreeId)
  )
}

export function resetAndroidAppRunStateForTests(): void {
  runs.clear()
  worktreeByRunId.clear()
  unsubscribeEvents?.()
  unsubscribeEvents = null
}
