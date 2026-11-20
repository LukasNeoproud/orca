import { describe, expect, it } from 'vitest'
import { agentStatusPromptDisplayText } from './agent-status-prompt-display'
import { normalizeAgentStatusPayload } from './agent-status-types'
import { deriveGeneratedTabTitle } from './agent-tab-title'

// The shape Claude Code 2.1.329 reported to UserPromptSubmit for a feedback message Orca pasted.
const HOOK_PROMPT =
  '<pasted_content id="fbf3">\nOrca quality gates failed after your last step (round 1 of 3, ref qg-d01cba88-1).\nFix it.\n</pasted_content id="fbf3">\n'

describe('agentStatusPromptDisplayText', () => {
  it('drops the paste tag from the stored single-line prompt, also when truncated', () => {
    const stored = normalizeAgentStatusPayload({ state: 'working', prompt: HOOK_PROMPT })!.prompt
    expect(agentStatusPromptDisplayText(stored)).toBe(
      'Orca quality gates failed after your last step (round 1 of 3, ref qg-d01cba88-1). Fix it.'
    )
    expect(agentStatusPromptDisplayText('<pasted_content id="fbf3"> Orca quality gates fai')).toBe(
      'Orca quality gates fai'
    )
  })

  it('keeps typed words around a paste and the id-less tag form', () => {
    expect(
      agentStatusPromptDisplayText(
        'see this: <pasted_content id="a"> body </pasted_content id="a">'
      )
    ).toBe('see this: body')
    expect(agentStatusPromptDisplayText('<pasted_content>\nbody\n</pasted_content>')).toBe('body')
  })

  it('leaves other text alone', () => {
    expect(agentStatusPromptDisplayText('  fix <pasted_content id="a b> parsing  ')).toBe(
      'fix <pasted_content id="a b> parsing'
    )
    expect(agentStatusPromptDisplayText('  plain prompt ')).toBe('plain prompt')
  })

  // Why: the rule belongs to readers; the store keeps what the hook reported (AGENTS.md, Agent Status).
  it('is not applied by the status store', () => {
    expect(normalizeAgentStatusPayload({ state: 'working', prompt: HOOK_PROMPT })!.prompt).toMatch(
      /^<pasted_content id="fbf3"> Orca quality gates failed/
    )
  })

  it('keeps the paste tag out of a generated tab title', () => {
    const stored = normalizeAgentStatusPayload({ state: 'working', prompt: HOOK_PROMPT })!.prompt
    expect(deriveGeneratedTabTitle(stored)).toBe('Orca quality gates failed after your')
  })
})
