// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatStructuredQuestionCard } from './NativeChatStructuredQuestionCard'
import type { AgentJournalQuestion } from '../../../../shared/agent-session-journal-types'
import type { ClaudeModsSurfaceEvent } from '../../../../shared/claude-mods-surface'
import { publishClaudeModsController } from './claude-mods/claude-mods-pane-surfaces'
import { ClaudeModsSurfaceController } from './claude-mods/claude-mods-surface-controller'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(question: AgentJournalQuestion) {
  const onAnswer = vi.fn()
  const onCancel = vi.fn()
  act(() =>
    root.render(
      <NativeChatStructuredQuestionCard
        questions={[question]}
        onAnswer={onAnswer}
        onCancel={onCancel}
      />
    )
  )
  return { onAnswer, onCancel }
}
function submit(): void {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === 'Submit'
  )
  if (!button) {
    throw new Error('Missing Submit button')
  }
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

const input: AgentJournalQuestion = {
  id: 'text',
  question: 'Enter text',
  options: [],
  multiSelect: false,
  freeTextQuestionId: 'text',
  freeTextInput: { allowEmpty: true, placeholder: 'Provider placeholder' }
}

describe('structured extension question cards', () => {
  it('submits an empty input as an answer', () => {
    const { onAnswer } = render(input)
    expect(container.querySelector('input')?.placeholder).toBe('Provider placeholder')
    submit()
    expect(onAnswer).toHaveBeenCalledWith({
      kind: 'answers',
      answers: [{ questionId: 'text', optionIds: [], other: '' }]
    })
  })

  it('renders the editor prefill and preserves whitespace, newlines and Unicode separators', () => {
    const text = ' first\nsecond\u2028third\u2029fourth '
    const { onAnswer } = render({
      ...input,
      freeTextInput: { allowEmpty: true, multiline: true, initialValue: text }
    })
    expect(container.querySelector('textarea')?.value).toBe(text)
    expect(container.querySelector('input')).toBeNull()
    submit()
    expect(onAnswer).toHaveBeenCalledWith({
      kind: 'answers',
      answers: [{ questionId: 'text', optionIds: [], other: text }]
    })
  })

  it('submits the text the user edited in the editor, not its prefill', () => {
    const { onAnswer } = render({
      ...input,
      freeTextInput: { allowEmpty: true, multiline: true, initialValue: 'prefill' }
    })
    const textarea = container.querySelector('textarea')
    if (!textarea) {
      throw new Error('Missing editor textarea')
    }
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      setValue?.call(textarea, 'prefill, then edited\nsecond line')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    submit()
    expect(onAnswer).toHaveBeenCalledWith({
      kind: 'answers',
      answers: [{ questionId: 'text', optionIds: [], other: 'prefill, then edited\nsecond line' }]
    })
  })

  it('keeps legacy empty input disabled', () => {
    const { onAnswer } = render({ ...input, freeTextInput: undefined })
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Submit'
      )
    ).toBe(false)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('keeps select-only questions limited to their offered values', () => {
    const { onAnswer } = render({
      id: 'q1',
      question: 'Select',
      options: [{ id: 'opaque-index-0', label: 'Choice' }],
      multiSelect: false
    })
    expect(container.querySelector('input')).toBeNull()
    const button = container.querySelector('button[aria-pressed]')
    if (!button) {
      throw new Error('Missing choice button')
    }
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    submit()
    expect(onAnswer).toHaveBeenCalledWith({
      kind: 'answers',
      answers: [{ questionId: 'q1', optionIds: ['opaque-index-0'] }]
    })
  })

  it('is asked about by a mod from outside the transcript provider, once the surface is attached', async () => {
    const asked: Record<string, unknown>[] = []
    let emit: (event: ClaudeModsSurfaceEvent) => void = () => {}
    const controller = new ClaudeModsSurfaceController(
      {
        request: async (subtype, fields) => {
          if (subtype === 'ui_render') {
            asked.push(fields)
          }
          return {
            tree: {
              type: 'Box',
              props: {},
              children: [
                { type: 'Text', children: ['mod note'] },
                { type: 'engine', ref: 0 }
              ]
            },
            props: {},
            rewritten: false,
            hooked: true
          }
        },
        subscribe: async (handlers) => {
          emit = handlers.onEvent
          return { unsubscribe: () => {} }
        }
      },
      () => {}
    )
    controller.start()
    publishClaudeModsController('pane-q', controller)
    await act(async () => {
      root.render(
        <NativeChatStructuredQuestionCard
          questions={[
            {
              id: 'q1',
              question: 'Pick one',
              multiSelect: false,
              options: [{ id: 'o1', label: 'A' }]
            }
          ]}
          toolUseId="toolu_q"
          paneKey="pane-q"
          onAnswer={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // Not attached yet: the card is the card alone and nothing is asked.
    expect(asked.filter((fields) => fields.component === 'AskUserQuestion')).toHaveLength(0)
    expect(container.textContent).not.toContain('mod note')
    await act(async () => {
      emit({
        type: 'state',
        available: true,
        roster: { panes: [], shown_id: null, focused_id: null, focus_requested_id: null },
        statuses: {}
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(asked.find((fields) => fields.component === 'AskUserQuestion')).toMatchObject({
      instance_id: 'toolu_q'
    })
    expect(container.textContent).toContain('mod note')
    expect(container.textContent).toContain('Pick one')
    publishClaudeModsController('pane-q', null)
  })
})
