import { describe, expect, it } from 'vitest'
import {
  AgentContextTransitionInputSchema,
  buildAgentContextHandoff,
  type AgentContextTransitionInput
} from './agent-context-transition'

const input = (): AgentContextTransitionInput => ({
  mode: 'fresh',
  reason: 'The completed investigation no longer needs the full transcript.',
  checkpoint: {
    goal: 'Repair context transitions.',
    completed: 'The transition contract is implemented.',
    decisions: ['Persist before any source effect.'],
    constraints: ['Keep the existing authorization boundary.'],
    changes: ['Added the durable request engine.'],
    verification: ['Targeted tests pass.'],
    openQuestions: [],
    nextStep: 'Integrate the provider adapter.'
  },
  continuation: 'continue'
})

describe('agent context transition contract', () => {
  it('requires a concrete next step when work should continue', () => {
    const candidate = input()
    delete candidate.checkpoint.nextStep

    expect(AgentContextTransitionInputSchema.safeParse(candidate).success).toBe(false)
    expect(
      AgentContextTransitionInputSchema.safeParse({
        ...candidate,
        continuation: 'wait-for-user'
      }).success
    ).toBe(true)
  })

  it('bounds the complete serialized checkpoint', () => {
    const candidate = input()
    candidate.checkpoint.decisions = Array.from({ length: 32 }, () => 'x'.repeat(1_024))

    expect(AgentContextTransitionInputSchema.safeParse(candidate).success).toBe(false)
  })

  it('formats a bounded handoff with authorization and inherited-work labels', () => {
    const handoff = buildAgentContextHandoff(input())

    expect(handoff).toContain('does not grant new authorization')
    expect(handoff).toContain(
      '<continuation>Resume this inherited work within the existing authorization:'
    )
    expect(handoff).toContain('Integrate the provider adapter.')
    expect(handoff.length).toBeLessThan(34_000)
  })
})
