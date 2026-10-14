import type { AgentStatusEntry, AgentStatusState } from '../../../shared/agent-status-types'

export type ReviewAgentTarget = { worktreeId: string; tabId: string | null; launchedAt: number }

export type ReviewAgentProgress = { sawWork: boolean; state: AgentStatusState | null }

export type ReviewAgentEvent = 'finished' | 'needs-input' | null

export const INITIAL_REVIEW_AGENT_PROGRESS: ReviewAgentProgress = { sawWork: false, state: null }

/** The review agent's newest status row; a chat launch has no tab id, so its worktree stands in. */
function reviewAgentEntry(
  entries: Readonly<Record<string, AgentStatusEntry>>,
  target: ReviewAgentTarget
): AgentStatusEntry | null {
  let newest: AgentStatusEntry | null = null
  for (const [paneKey, entry] of Object.entries(entries)) {
    const matches = target.tabId
      ? paneKey.startsWith(`${target.tabId}:`)
      : entry.worktreeId === target.worktreeId
    if (
      matches &&
      entry.updatedAt >= target.launchedAt &&
      entry.updatedAt > (newest?.updatedAt ?? -1)
    ) {
      newest = entry
    }
  }
  return newest
}

/** Advances the watch; an event fires once, on the transition into that state. */
export function advanceReviewAgentProgress(
  progress: ReviewAgentProgress,
  entries: Readonly<Record<string, AgentStatusEntry>>,
  target: ReviewAgentTarget
): { progress: ReviewAgentProgress; event: ReviewAgentEvent } {
  const state = reviewAgentEntry(entries, target)?.state ?? null
  if (state === null || state === progress.state) {
    return { progress, event: null }
  }
  const sawWork = progress.sawWork || state === 'working'
  const next = { sawWork, state }
  if (state === 'done' && sawWork) {
    return { progress: next, event: 'finished' }
  }
  if ((state === 'waiting' || state === 'blocked') && sawWork) {
    return { progress: next, event: 'needs-input' }
  }
  return { progress: next, event: null }
}
