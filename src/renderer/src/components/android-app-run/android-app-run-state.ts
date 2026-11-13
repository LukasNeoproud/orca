import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
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
  /** Only filled when the build could not get a terminal tab. */
  output: string
  /** Terminal tab holding the build output. */
  terminalTabId?: string
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
  if (event.kind === 'output') {
    runs.set(worktreeId, {
      ...current,
      output: (current.output + event.text).slice(-MAX_OUTPUT_CHARS)
    })
  } else if (event.kind === 'terminal') {
    runs.set(worktreeId, { ...current, terminalTabId: event.tabId })
  } else {
    runs.set(worktreeId, { ...current, phase: event.phase, detail: event.detail })
    // The popover is usually closed by now, so the outcome has to reach the user elsewhere.
    if (event.phase === 'done') {
      toast.success(translate('components.androidAppRun.phase.done', 'App is running'))
    } else if (event.phase === 'failed') {
      toast.error(translate('components.androidAppRun.phase.failed', 'Run failed'), {
        description: event.detail
      })
    }
  }
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
