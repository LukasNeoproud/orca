// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeOrcaInteractionResult,
  type OrcaInteractionRequest
} from '../../../../shared/orca-interaction'
import { decodeAgentSessionQuestionAnswers } from '../../../../shared/agent-session-question-answer'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import { NativeChatInteractionCard } from './NativeChatInteractionCard'
import { NativeChatStructuredPromptCard } from './NativeChatStructuredPromptCard'

afterEach(cleanup)

function decodedAnswer(onRespond: ReturnType<typeof vi.fn>): unknown {
  return decodeOrcaInteractionResult(onRespond.mock.calls[0]?.[0] as string)
}

describe('NativeChatInteractionCard', () => {
  it('renders multi-field defaults without auto-selecting the recommended option', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const request: OrcaInteractionRequest = {
      title: 'Configure deployment',
      fields: [
        {
          id: 'target',
          type: 'single_choice',
          label: 'Target',
          required: true,
          default: 'preview',
          options: [
            { id: 'production', label: 'Production', recommended: true },
            { id: 'preview', label: 'Preview', description: 'Create a preview deployment' }
          ]
        },
        {
          id: 'checks',
          type: 'multi_choice',
          label: 'Checks',
          default: ['test'],
          options: [
            { id: 'lint', label: 'Lint' },
            { id: 'test', label: 'Test' }
          ]
        },
        { id: 'notify', type: 'boolean', label: 'Notify the team?', default: false },
        { id: 'note', type: 'text', label: 'Note', default: 'Ready' },
        { id: 'retries', type: 'number', label: 'Retries', default: 2, min: 0, max: 4 }
      ]
    }

    render(<NativeChatInteractionCard request={request} onRespond={onRespond} />)

    expect(screen.getByText('Recommended')).toBeTruthy()
    expect((screen.getByRole('radio', { name: /Production/ }) as HTMLInputElement).checked).toBe(
      false
    )
    expect((screen.getByRole('radio', { name: /Preview/ }) as HTMLInputElement).checked).toBe(true)
    expect(
      (screen.getByRole('checkbox', { name: 'Test' }) as HTMLButtonElement).dataset.state
    ).toBe('checked')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(decodedAnswer(onRespond)).toEqual({
      status: 'submitted',
      values: { target: 'preview', checks: ['test'], notify: false, note: 'Ready', retries: 2 }
    })
  })

  it('returns custom choice values alongside multi-select options', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const request: OrcaInteractionRequest = {
      fields: [
        {
          id: 'targets',
          type: 'multi_choice',
          label: 'Targets',
          required: true,
          allowCustom: true,
          options: [
            { id: 'web', label: 'Web' },
            { id: 'mobile', label: 'Mobile' }
          ]
        }
      ]
    }

    render(<NativeChatInteractionCard request={request} onRespond={onRespond} />)
    await user.click(screen.getByRole('checkbox', { name: 'Web' }))
    await user.type(screen.getByRole('textbox', { name: 'Custom answer' }), 'Desktop')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(decodedAnswer(onRespond)).toEqual({
      status: 'submitted',
      values: { targets: ['web', { type: 'custom', value: 'Desktop' }] }
    })
  })

  it('disables submit until text and numeric constraints are satisfied', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const request: OrcaInteractionRequest = {
      fields: [
        {
          id: 'code',
          type: 'text',
          label: 'Code',
          required: true,
          minLength: 3,
          maxLength: 4
        },
        { id: 'count', type: 'number', label: 'Count', required: true, min: 1, max: 5, step: 2 }
      ]
    }

    render(<NativeChatInteractionCard request={request} onRespond={onRespond} />)
    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    await user.type(screen.getByRole('textbox', { name: /Code/ }), 'abc')
    await user.type(screen.getByRole('spinbutton', { name: /Count/ }), '3')
    expect(submit.disabled).toBe(false)
    await user.click(submit)

    expect(decodedAnswer(onRespond)).toEqual({
      status: 'submitted',
      values: { code: 'abc', count: 3 }
    })
  })

  it('keeps booleans without defaults unset until the user chooses', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const request: OrcaInteractionRequest = {
      fields: [
        { id: 'optional', type: 'boolean', label: 'Optional flag' },
        { id: 'required', type: 'boolean', label: 'Required flag', required: true }
      ]
    }

    render(<NativeChatInteractionCard request={request} onRespond={onRespond} />)
    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByText('Complete this required field.')).toBeTruthy()
    expect(screen.getByRole('group', { name: /Required flag/ }).getAttribute('aria-invalid')).toBe(
      'true'
    )

    const required = screen.getByRole('group', { name: /Required flag/ })
    await user.click(within(required).getByRole('radio', { name: 'No' }))
    expect(submit.disabled).toBe(false)
    await user.click(submit)

    expect(decodedAnswer(onRespond)).toEqual({
      status: 'submitted',
      values: { required: false }
    })
  })

  it('distinguishes an omitted optional boolean from explicit false', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const request: OrcaInteractionRequest = {
      fields: [{ id: 'optional', type: 'boolean', label: 'Optional flag' }]
    }

    render(<NativeChatInteractionCard request={request} onRespond={onRespond} />)
    const optional = screen.getByRole('group', { name: /Optional flag/ })
    await user.click(within(optional).getByRole('radio', { name: 'No' }))
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(decodedAnswer(onRespond)).toEqual({
      status: 'submitted',
      values: { optional: false }
    })
  })

  it('keeps Enter in a textarea as input and cancels with Escape', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const request: OrcaInteractionRequest = {
      fields: [{ id: 'detail', type: 'textarea', label: 'Detail', required: true }]
    }

    render(<NativeChatInteractionCard request={request} onRespond={onRespond} />)
    const textarea = screen.getByRole('textbox', { name: /Detail/ })
    await user.type(textarea, 'line one{Enter}line two')
    expect(onRespond).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')

    expect(decodedAnswer(onRespond)).toEqual({ status: 'cancelled' })
  })

  it('routes rich prompt cancellation through onRespond, not turn cancellation', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const onCancel = vi.fn()
    const interaction: OrcaInteractionRequest = {
      fields: [{ id: 'name', type: 'text', label: 'Name' }]
    }
    const prompt: AgentJournalRenderItem = {
      itemId: 'question-1',
      revision: 1,
      sequence: 1,
      observedAt: 1,
      body: {
        kind: 'question',
        question: 'Fallback',
        options: [],
        interaction,
        resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
      }
    }

    render(
      <NativeChatStructuredPromptCard
        prompt={prompt}
        turnId="turn-1"
        onRespond={onRespond}
        onCancel={onCancel}
      />
    )
    await user.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!)

    expect(decodedAnswer(onRespond)).toEqual({ status: 'cancelled' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('renders the ordinary fallback and returns structured cancellation for a future interaction', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const onCancel = vi.fn()
    const prompt: AgentJournalRenderItem = {
      itemId: 'question-future',
      revision: 1,
      sequence: 1,
      observedAt: 1,
      body: {
        kind: 'question',
        question: 'Future interaction',
        options: [{ id: 'fallback', label: 'Use fallback' }],
        interaction: { fields: [{ id: 'priority', type: 'ranking', label: 'Priority' }] },
        resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
      }
    }

    render(
      <NativeChatStructuredPromptCard
        prompt={prompt}
        turnId="turn-1"
        onRespond={onRespond}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText('Use fallback')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(decodedAnswer(onRespond)).toEqual({ status: 'cancelled' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('submits grouped interaction fallback answers when an optional field is skipped', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const prompt: AgentJournalRenderItem = {
      itemId: 'question-grouped-future',
      revision: 1,
      sequence: 1,
      observedAt: 1,
      body: {
        kind: 'question',
        question: 'Future interaction',
        options: [],
        questions: [
          {
            id: 'note',
            question: 'Optional note',
            multiSelect: false,
            options: [{ id: '__orca_skip__', label: 'Skip' }]
          },
          {
            id: 'enabled',
            question: 'Enable it?',
            multiSelect: false,
            options: [
              { id: '__orca_true__', label: 'Yes' },
              { id: '__orca_false__', label: 'No' }
            ]
          }
        ],
        interaction: { fields: [{ id: 'priority', type: 'ranking', label: 'Priority' }] },
        resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
      }
    }

    render(
      <NativeChatStructuredPromptCard
        prompt={prompt}
        turnId="turn-1"
        onRespond={onRespond}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getAllByRole('button', { name: 'Skip' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: /Yes/ }))
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onRespond).toHaveBeenCalledWith(
      expect.stringContaining('"questionId":"note","optionIds":["__orca_skip__"]')
    )
  })

  it('preserves text whitespace in the grouped interaction fallback', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()
    const prompt: AgentJournalRenderItem = {
      itemId: 'question-text-future',
      revision: 1,
      sequence: 1,
      observedAt: 1,
      body: {
        kind: 'question',
        question: 'Future interaction',
        options: [],
        questions: [
          {
            id: 'note',
            question: 'Note',
            multiSelect: false,
            options: [],
            freeTextQuestionId: 'note'
          }
        ],
        interaction: { fields: [{ id: 'priority', type: 'ranking', label: 'Priority' }] },
        resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
      }
    }

    render(
      <NativeChatStructuredPromptCard
        prompt={prompt}
        turnId="turn-1"
        onRespond={onRespond}
        onCancel={vi.fn()}
      />
    )
    await user.type(screen.getByRole('textbox'), '  a')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(decodeAgentSessionQuestionAnswers(onRespond.mock.calls[0]?.[0])).toEqual([
      { questionId: 'note', optionIds: [], other: '  a' }
    ])
  })
})
