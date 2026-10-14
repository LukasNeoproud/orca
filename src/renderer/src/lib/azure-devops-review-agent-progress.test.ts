import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry, AgentStatusState } from '../../../shared/agent-status-types'
import {
  advanceReviewAgentProgress,
  INITIAL_REVIEW_AGENT_PROGRESS,
  type ReviewAgentEvent,
  type ReviewAgentTarget
} from './azure-devops-review-agent-progress'

function entry(state: AgentStatusState, updatedAt: number, worktreeId = 'wt'): AgentStatusEntry {
  return {
    state,
    prompt: '',
    updatedAt,
    stateStartedAt: updatedAt,
    paneKey: 'tab:leaf',
    worktreeId,
    stateHistory: []
  }
}

function replay(
  target: ReviewAgentTarget,
  steps: Record<string, AgentStatusEntry>[]
): ReviewAgentEvent[] {
  let progress = INITIAL_REVIEW_AGENT_PROGRESS
  return steps.map((entries) => {
    const result = advanceReviewAgentProgress(progress, entries, target)
    progress = result.progress
    return result.event
  })
}

describe('advanceReviewAgentProgress', () => {
  const target = { worktreeId: 'wt', tabId: 'tab', launchedAt: 100 }

  it('finishes once the agent worked and then went idle', () => {
    expect(
      replay(target, [
        { 'tab:leaf': entry('done', 110) },
        { 'tab:leaf': entry('working', 120) },
        { 'tab:leaf': entry('working', 130) },
        { 'tab:leaf': entry('done', 140) },
        { 'tab:leaf': entry('done', 150) }
      ])
    ).toEqual([null, null, null, 'finished', null])
  })

  it('reports a question or permission prompt during the review', () => {
    expect(
      replay(target, [
        { 'tab:leaf': entry('working', 120) },
        { 'tab:leaf': entry('blocked', 130) },
        { 'tab:leaf': entry('working', 140) },
        { 'tab:leaf': entry('done', 150) }
      ])
    ).toEqual([null, 'needs-input', null, 'finished'])
  })

  it('ignores rows from before the launch and from other tabs', () => {
    expect(
      replay(target, [
        { 'tab:leaf': entry('working', 50) },
        { 'other:leaf': entry('working', 120), 'tab:leaf': entry('done', 90) }
      ])
    ).toEqual([null, null])
  })

  it('matches a chat launch by its worktree', () => {
    const chat = { worktreeId: 'wt', tabId: null, launchedAt: 100 }
    expect(
      replay(chat, [{ 'chat:leaf': entry('working', 120) }, { 'chat:leaf': entry('done', 130) }])
    ).toEqual([null, 'finished'])
  })
})
