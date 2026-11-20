import { describe, expect, it } from 'vitest'
import { normalizeAgentStatusPayload } from '../../../shared/agent-status-types'
import { getActivityThreadTaskTitle } from './activity-thread-display'
import { getAgentRowPrimaryText } from './agent-row-primary-text'

// What the status store keeps for a feedback message Claude Code reported as a paste.
const storedPrompt = normalizeAgentStatusPayload({
  state: 'working',
  prompt:
    '<pasted_content id="fbf3">\nOrca quality gates failed after your last step (round 1 of 3).\n</pasted_content id="fbf3">\n'
})!.prompt
const readable = 'Orca quality gates failed after your last step (round 1 of 3).'

describe('agent status readers show a pasted prompt without the paste tag', () => {
  it('sidebar, dashboard and activity rows', () => {
    expect(getAgentRowPrimaryText({ prompt: storedPrompt })).toBe(readable)
  })

  it('activity task title, live and from history', () => {
    const tab = { customTitle: null, generatedTitle: null, title: 'Claude', defaultTitle: 'Claude' }
    const history = [
      { state: 'done' as const, prompt: storedPrompt, startedAt: 1 },
      { state: 'done' as const, prompt: 'yes', startedAt: 2 }
    ]
    expect(
      getActivityThreadTaskTitle({
        entry: { prompt: storedPrompt, stateHistory: [] },
        tab,
        generatedTitlesEnabled: false
      })
    ).toBe(readable)
    expect(
      getActivityThreadTaskTitle({
        entry: { prompt: 'yes', stateHistory: history },
        tab,
        generatedTitlesEnabled: false
      })
    ).toBe(readable)
  })
})
