// Wire bounds for prompt responses: a decision id for an approval, structured answers for a question.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  call,
  clearStructuredHostStub,
  envelope,
  hostCalls,
  installStructuredHostStub,
  STRUCTURED_CLIENT
} from './structured-agent-session-rpc.test-fixture'

beforeEach(() => {
  installStructuredHostStub()
})

afterEach(() => {
  clearStructuredHostStub()
})

describe('prompt response parameters', () => {
  const rejects = async (method: string, params: unknown): Promise<void> => {
    const response = await call(method, params, STRUCTURED_CLIENT)
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  }

  it('accepts grouped choices and interaction results above 1 KiB and retains a finite bound', async () => {
    const maximumSelections = Array.from({ length: 4 }, (_, questionIndex) => ({
      questionId: `q${questionIndex + 1}`,
      optionIds: Array.from(
        { length: 4 },
        (_, optionIndex) => `q${questionIndex + 1}:choice-${optionIndex + 1}`
      )
    }))
    const optionId = `question-group:${encodeURIComponent(JSON.stringify(maximumSelections))}`
    expect(optionId.length).toBe(610)

    const response = await call(
      'agentSession.respondToQuestion',
      {
        envelope: envelope(),
        itemId: 'item-1',
        expectedRevision: 1,
        optionId
      },
      STRUCTURED_CLIENT
    )
    expect(response).toMatchObject({ ok: true })
    expect(hostCalls.respondToPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ optionId })
    )

    // Orca interaction results ride the option id, so a question answer may exceed 1 KiB.
    const interactionAnswer = `question-group:${JSON.stringify([
      { questionId: 'notes', optionIds: [], other: 'x'.repeat(2_048) }
    ])}`
    expect(interactionAnswer.length).toBeGreaterThan(1_024)
    expect(
      await call(
        'agentSession.respondToQuestion',
        {
          envelope: envelope(),
          itemId: 'item-1',
          expectedRevision: 1,
          optionId: interactionAnswer
        },
        STRUCTURED_CLIENT
      )
    ).toMatchObject({ ok: true })

    await rejects('agentSession.respondToQuestion', {
      envelope: envelope(),
      itemId: 'item-1',
      expectedRevision: 1,
      optionId: 'x'.repeat(256 * 1024 + 1)
    })
    await rejects('agentSession.respondToApproval', {
      envelope: envelope(),
      itemId: 'item-1',
      expectedRevision: 1,
      optionId: 'x'.repeat(1025)
    })
  })

  it('takes a long typed answer as structured answers and bounds each field', async () => {
    const answers = [
      { questionId: 'q1', optionIds: ['q1:choice-1'] },
      { questionId: 'q2', optionIds: [], other: 'Proceed with the replacement. '.repeat(100) }
    ]
    const response = await call(
      'agentSession.respondToQuestion',
      { envelope: envelope(), itemId: 'item-1', expectedRevision: 1, answers },
      STRUCTURED_CLIENT
    )
    expect(response).toMatchObject({ ok: true })
    expect(hostCalls.respondToPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'question', answers })
    )

    const base = { envelope: envelope(), itemId: 'item-1', expectedRevision: 1 }
    await rejects('agentSession.respondToQuestion', base)
    await rejects('agentSession.respondToQuestion', { ...base, optionId: 'q1:choice-1', answers })
    await rejects('agentSession.respondToQuestion', {
      ...base,
      answers: [{ questionId: 'q1', optionIds: [], other: 'x'.repeat(64 * 1024 + 1) }]
    })
    await rejects('agentSession.respondToQuestion', {
      ...base,
      answers: [{ questionId: 'q1', optionIds: [], other: 'é'.repeat(40 * 1024) }]
    })
    await rejects('agentSession.respondToApproval', { ...base, answers })
    await rejects('agentSession.respondToApproval', { ...base, optionId: 'x'.repeat(1025) })
  })

  it('takes a question id exactly as the agent wrote it, including edge spaces', async () => {
    const answers = [{ questionId: 'scope ', optionIds: [], other: 'mine' }]
    const response = await call(
      'agentSession.respondToQuestion',
      { envelope: envelope(), itemId: 'item-1', expectedRevision: 1, answers },
      STRUCTURED_CLIENT
    )
    expect(response).toMatchObject({ ok: true })
    expect(hostCalls.respondToPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'question', answers })
    )
  })
})
