// @vitest-environment happy-dom

import {
  cleanup,
  fireEvent,
  render as renderBare,
  screen,
  type RenderOptions
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatApprovalCard } from './NativeChatApprovalCard'

// A plan card's full-screen button carries a tooltip.
const render = (ui: React.ReactNode, options?: RenderOptions) =>
  renderBare(ui, { wrapper: TooltipProvider, ...options })

afterEach(cleanup)

describe('NativeChatApprovalCard', () => {
  describe("a subject of a kind this build cannot draw: a newer Orca's", () => {
    // A subject kind a newer build wrote; this build draws only plans.
    const NEWER_SUBJECT = JSON.parse('{"kind":"diff","path":"a.ts"}')
    const NEEDS_NEWER_ORCA = 'This request needs a newer version of Orca.'

    function renderNewer(detail: string | undefined) {
      const onChoose = vi.fn()
      const onCancel = vi.fn()
      render(
        <NativeChatApprovalCard
          approval={{
            title: 'Review proposed change',
            ...(detail ? { detail } : {}),
            subject: NEWER_SUBJECT,
            options: [
              { label: 'Approve', send: 'allow' },
              { label: 'Deny', send: 'deny' }
            ]
          }}
          onChoose={onChoose}
          onCancel={onCancel}
        />
      )
      return { onChoose, onCancel }
    }

    it('with no detail: says so, answers nothing, and only its cancel reaches the host', () => {
      const { onChoose, onCancel } = renderNewer(undefined)
      expect(screen.getByText(NEEDS_NEWER_ORCA)).toBeTruthy()
      for (const label of ['Approve', 'Deny']) {
        const option = screen.getByRole('button', { name: label })
        expect(option.hasAttribute('disabled')).toBe(true)
        fireEvent.click(option)
      }
      expect(onChoose).not.toHaveBeenCalled()
      const cancel = screen.getByRole('button', { name: 'Cancel' })
      expect(cancel.hasAttribute('disabled')).toBe(false)
      fireEvent.click(cancel)
      fireEvent.keyDown(screen.getByRole('group'), { key: 'Escape' })
      expect(onCancel).toHaveBeenCalledTimes(2)
    })

    it('with a detail: shows it, and still approves nothing', () => {
      const { onChoose } = renderNewer('# Release\n- Run tests')
      expect(document.querySelector('[data-native-chat-approval-detail]')?.textContent).toContain(
        '# Release'
      )
      expect(screen.getByText(NEEDS_NEWER_ORCA)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
      expect(screen.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
      expect(onChoose).not.toHaveBeenCalled()
    })

    it('leaves a plan answerable, with no such line', () => {
      const onChoose = vi.fn()
      render(
        <NativeChatApprovalCard
          approval={{
            title: 'Review proposed plan',
            subject: { kind: 'plan', text: 'Step one' },
            options: [{ label: 'Approve plan', send: 'allow' }]
          }}
          onChoose={onChoose}
        />
      )
      expect(screen.queryByText(NEEDS_NEWER_ORCA)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Approve plan' }))
      expect(onChoose).toHaveBeenCalledWith('allow')
    })
  })

  it('exposes cancellation while it owns the composer region', () => {
    const onCancel = vi.fn()

    render(
      <NativeChatApprovalCard
        approval={{
          title: 'Allow command?',
          detail: 'pnpm test',
          options: [
            { label: 'Allow', send: 'allow' },
            { label: 'Deny', send: 'deny' }
          ]
        }}
        onChoose={() => {}}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('focuses once on appearance and routes Escape through cancellation', () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <NativeChatApprovalCard
        approval={{ title: 'Allow command?', options: [{ label: 'Allow', send: 'allow' }] }}
        onChoose={() => {}}
        onCancel={onCancel}
        shouldFocus
      />
    )
    const card = screen.getByRole('group', { name: 'Allow command?' })

    expect(document.activeElement).toBe(card)
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    rerender(
      <NativeChatApprovalCard
        approval={{ title: 'Allow command?', options: [{ label: 'Allow', send: 'allow' }] }}
        onChoose={() => {}}
        onCancel={onCancel}
        shouldFocus
      />
    )
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it.each([
    ['this pane', true],
    ['another surface', false]
  ] as const)('with a text field focused in %s, takes focus: %s', (_where, takes) => {
    const pane = document.createElement('div')
    pane.setAttribute('data-native-chat-root', 'true')
    const draft = document.createElement('textarea')
    ;(takes ? pane : document.body).appendChild(draft)
    document.body.appendChild(pane)
    draft.focus()
    render(
      <NativeChatApprovalCard
        approval={{ title: 'Allow command?', options: [{ label: 'Allow', send: 'allow' }] }}
        onChoose={() => {}}
        shouldFocus
      />,
      { container: pane }
    )
    const card = screen.getByRole('group', { name: 'Allow command?' })
    expect(document.activeElement).toBe(takes ? card : draft)
    pane.remove()
    draft.remove()
  })

  it('keeps all oversized provider context in one bounded scroller above the actions', () => {
    const description = `Read access outside the workspace ${'description '.repeat(400)}`
    const decisionReason = `The path is outside the allowed root. ${'reason '.repeat(400)}`
    render(
      <NativeChatApprovalCard
        approval={{
          title: 'Claude wants to read secrets.txt '.repeat(400),
          description,
          decisionReason,
          detail: 'x'.repeat(4_000),
          options: [{ label: 'Allow', send: 'allow' }]
        }}
        onChoose={() => {}}
      />
    )

    const card = document.querySelector('[data-native-chat-approval-card="true"]')
    const content = document.querySelector('[data-native-chat-approval-content="true"]')
    const detail = document.querySelector('[data-native-chat-approval-detail="true"]')
    const actions = document.querySelector('[data-native-chat-approval-actions="true"]')
    const allow = screen.getByRole('button', { name: 'Allow' })

    expect(card?.classList.contains('min-h-0')).toBe(true)
    expect(card?.classList.contains('overflow-hidden')).toBe(true)
    expect(content?.classList.contains('max-h-72')).toBe(true)
    expect(content?.classList.contains('overflow-auto')).toBe(true)
    expect(content?.getAttribute('tabindex')).toBe('0')
    expect(content?.textContent).toContain(description.trim())
    expect(content?.textContent).toContain(decisionReason.trim())
    expect(content?.contains(detail)).toBe(true)
    expect(content?.contains(allow)).toBe(false)
    expect(actions?.contains(allow)).toBe(true)
    expect(actions?.classList.contains('shrink-0')).toBe(true)
  })

  // The path is what the request touches; the provider's ask-rule bookkeeping is not something to decide on.
  it('names a blocked path the request does not show, but never the matched ask rule', () => {
    const fromJournal = {
      title: 'Claude wants to run git push',
      decisionReason: 'Pushing changes the remote',
      blockedPath: 'C:\\qa\\demo\\.git\\config',
      matchedAskRule: {
        source: 'projectSettings',
        toolName: 'Bash',
        ruleContent: 'Bash(git push:*)'
      },
      detail: 'git push origin main',
      options: [{ label: 'Allow', send: 'allow' }]
    }
    render(<NativeChatApprovalCard approval={fromJournal} onChoose={() => {}} />)
    const content = document.querySelector('[data-native-chat-approval-content="true"]')
    expect(content?.textContent).toContain('Reason: Pushing changes the remote')
    expect(content?.textContent).toContain('git push origin main')
    expect(content?.textContent).toContain('Needs access to: C:\\qa\\demo\\.git\\config')
    for (const internal of ['Ask rule', 'Bash(git push:*)', 'projectSettings', 'Blocked path']) {
      expect(content?.textContent).not.toContain(internal)
    }
  })

  it('does not repeat a blocked path the request already shows', () => {
    const blockedPath = 'C:\\qa\\demo\\notes.md'
    render(
      <NativeChatApprovalCard
        approval={{
          title: 'Claude wants to write notes.md',
          blockedPath,
          detail: JSON.stringify({ file_path: blockedPath, content: 'hi' }, null, 2),
          options: [{ label: 'Allow', send: 'allow' }]
        }}
        onChoose={() => {}}
      />
    )
    const content = document.querySelector('[data-native-chat-approval-content="true"]')
    expect(content?.textContent).toContain('notes.md')
    expect(content?.textContent).not.toContain('Needs access to')
  })

  it('shows the blocked path alone when the provider sent nothing else to show', () => {
    render(
      <NativeChatApprovalCard
        approval={{
          title: 'Allow Read?',
          blockedPath: '/outside/repo/secrets.txt',
          options: [{ label: 'Allow', send: 'allow' }]
        }}
        onChoose={() => {}}
      />
    )
    const content = document.querySelector('[data-native-chat-approval-content="true"]')
    expect(content?.textContent).toBe('Needs access to: /outside/repo/secrets.txt')
  })

  it('renders a plan as markdown inside the same bounded scroller', () => {
    render(
      <NativeChatApprovalCard
        approval={{
          title: 'Claude wants to present its plan',
          subject: {
            kind: 'plan',
            text: '# Release plan\n\n- Run the tests',
            filePath: '/repo/PLAN.md'
          },
          detail: '{"plan":"raw json that must not be shown"}',
          options: [
            { label: 'Approve plan', send: 'allow' },
            { label: 'Keep planning', send: 'deny' }
          ]
        }}
        onChoose={() => {}}
      />
    )

    const content = document.querySelector('[data-native-chat-approval-content="true"]')
    const plan = document.querySelector('[data-native-chat-approval-plan="true"]')
    const actions = document.querySelector('[data-native-chat-approval-actions="true"]')
    const approve = screen.getByRole('button', { name: 'Approve plan' })

    // Living in the shared region is what gives a plan the cap and the scroll.
    expect(content?.contains(plan)).toBe(true)
    expect(content?.classList.contains('max-h-72')).toBe(true)
    expect(content?.classList.contains('overflow-auto')).toBe(true)
    // A document, not a payload.
    expect(screen.getByRole('heading', { name: 'Release plan' })).toBeTruthy()
    expect(content?.textContent).toContain('/repo/PLAN.md')
    // A typed plan replaces the generic detail rather than rendering both.
    expect(document.querySelector('[data-native-chat-approval-detail="true"]')).toBeNull()
    expect(content?.textContent).not.toContain('raw json that must not be shown')
    expect(actions?.contains(approve)).toBe(true)
    expect(content?.contains(approve)).toBe(false)
  })

  describe('a plan that accepts a note', () => {
    function renderPlan() {
      const onChoose = vi.fn()
      const onCancel = vi.fn()
      render(
        <NativeChatApprovalCard
          approval={{
            title: 'Review proposed plan',
            subject: { kind: 'plan', text: '# Release plan\n\n- Run the tests' },
            accepts: { note: true },
            options: [
              { label: 'Approve', send: 'allow' },
              { label: 'Keep planning', send: 'deny' }
            ]
          }}
          onChoose={onChoose}
          onCancel={onCancel}
        />
      )
      return { onChoose, onCancel }
    }
    const NOTE = 'What should change in the plan? (sent with Keep planning)'

    it('sends the typed note with Keep planning', () => {
      const { onChoose } = renderPlan()
      fireEvent.change(screen.getByRole('textbox', { name: NOTE }), {
        target: { value: 'Skip the migration' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Keep planning' }))
      expect(onChoose).toHaveBeenCalledWith('deny', { note: 'Skip the migration' })
    })

    it('opens the plan full screen and answers from there with the same note', () => {
      const { onChoose, onCancel } = renderPlan()
      fireEvent.change(screen.getByRole('textbox', { name: NOTE }), {
        target: { value: 'Split step 2' }
      })
      const openDialog = (): HTMLElement => {
        fireEvent.click(screen.getByRole('button', { name: 'Open the plan full screen' }))
        return screen.getByRole('dialog')
      }
      const noteIn = (dialog: HTMLElement): HTMLTextAreaElement =>
        dialog.querySelector<HTMLTextAreaElement>('[data-native-chat-approval-note]')!
      let dialog = openDialog()
      expect(
        dialog.querySelector('[data-native-chat-approval-plan="true"]')?.textContent
      ).toContain('Release plan')
      // The note typed in the card is the one the dialog edits.
      expect(noteIn(dialog).value).toBe('Split step 2')
      fireEvent.change(noteIn(dialog), { target: { value: 'Split step 2 in two' } })
      // Escape closes the dialog only: reaching the card, it would cancel the turn.
      fireEvent.keyDown(noteIn(dialog), { key: 'Escape' })
      expect(onCancel).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
      dialog = openDialog()
      expect(noteIn(dialog).value).toBe('Split step 2 in two')
      const keepPlanning = Array.from(dialog.querySelectorAll('button')).find(
        (button) => button.textContent === 'Keep planning'
      )
      fireEvent.click(keepPlanning!)
      expect(onChoose).toHaveBeenCalledWith('deny', { note: 'Split step 2 in two' })
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
