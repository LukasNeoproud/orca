// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AzureDevOpsReviewDraftView } from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewDraftCard } from './AzureDevOpsReviewDraftCard'

const updateDraft = vi.hoisted(() => vi.fn())

vi.mock('@/lib/azure-devops-review-client', () => ({
  updateAzureDevOpsReviewDraft: updateDraft,
  deleteAzureDevOpsReviewDraft: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./AzureDevOpsDraftAiPrompt', () => ({ AzureDevOpsDraftAiPrompt: () => null }))
vi.mock('@/components/sidebar/comment-markdown-lazy', () => ({
  CommentMarkdownAsync: ({ content }: { content: string }) => (
    <div data-testid="draft-body">{content}</div>
  )
}))
// Why plain buttons: the Radix menu needs pointer capture and layout that happy-dom lacks.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuRadioGroup: ({
    onValueChange,
    children
  }: {
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <div
      onClick={(event) => {
        const value = event.target instanceof HTMLElement ? event.target.dataset.value : undefined
        if (value) {
          onValueChange(value)
        }
      }}
    >
      {children}
    </div>
  ),
  DropdownMenuRadioItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button type="button" role="menuitemradio" aria-checked="false" data-value={value}>
      {children}
    </button>
  )
}))

const citation = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 5,
  quote: 'sum += item',
  note: 'Adds the price as it is.'
}

function draft(patch: Partial<AzureDevOpsReviewDraftView> = {}): AzureDevOpsReviewDraftView {
  return {
    id: 'd1',
    pullRequestKey: 'dev.azure.com/contoso+repo+7',
    kind: 'inline',
    filePath: 'src/cart.ts',
    anchor: { side: 'right', startLine: 5, endLine: 5 },
    threadId: null,
    threadStatus: null,
    body: 'Negative prices lower the total.',
    author: { kind: 'agent', label: 'claude' },
    iterationId: 2,
    commit: 'bbb2',
    state: 'draft',
    publishError: null,
    publishedThreadId: null,
    createdAt: 1,
    updatedAt: 1,
    outdated: false,
    ...patch
  }
}

function show(
  view: AzureDevOpsReviewDraftView,
  { changedPaths = ['src/cart.ts'], severityEditable = true } = {}
) {
  const open = vi.fn()
  const onChanged = vi.fn(async () => undefined)
  const { container } = render(
    <TooltipProvider>
      <ul>
        <AzureDevOpsReviewDraftCard
          draft={view}
          selected={false}
          onSelectedChange={() => undefined}
          onChanged={onChanged}
          openInDiff={{ canOpen: (path) => changedPaths.includes(path), open }}
          severityEditable={severityEditable}
        />
      </ul>
    </TooltipProvider>
  )
  const certainty = () =>
    container.querySelector<HTMLElement>('[data-certainty]')?.dataset.certainty ?? null
  return { container, open, onChanged, certainty }
}

const evidenceToggle = () => screen.getByRole('button', { name: /^Evidence \(/ })

describe('AzureDevOpsReviewDraftCard with a finding', () => {
  beforeEach(() => updateDraft.mockReset().mockResolvedValue(undefined))
  afterEach(cleanup)

  it('marks an agent draft without evidence as uncertain and shows no evidence list', () => {
    const { certainty } = show(draft({ certainty: 'uncertain' }))
    expect(certainty()).toBe('uncertain')
    expect(screen.getByText('Uncertain')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Evidence/ })).toBeNull()
  })

  it('shows no certainty on a hand-written draft', () => {
    const { certainty } = show(draft({ author: { kind: 'user' }, severity: 'nit' }))
    expect(certainty()).toBeNull()
    expect(screen.queryByText(/Uncertain|Likely|Contradicted|Verified/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Severity: Nit' })).toBeTruthy()
  })

  it('shows a likely finding with its evidence collapsed until asked for', () => {
    const { certainty, open } = show(
      draft({
        severity: 'warning',
        certainty: 'likely',
        evidence: [citation],
        evidenceChecks: [{ status: 'confirmed' }]
      })
    )
    expect(certainty()).toBe('likely')
    expect(screen.queryByText('sum += item')).toBeNull()

    fireEvent.click(evidenceToggle())
    expect(evidenceToggle().textContent).toBe('Evidence (1)')
    expect(screen.getByText('In the file')).toBeTruthy()
    expect(screen.getByText('src/cart.ts:4–5')).toBeTruthy()
    expect(screen.getByText('Adds the price as it is.')).toBeTruthy()
    expect(screen.getByLabelText('Quoted code').textContent).toBe('sum += item')

    fireEvent.click(screen.getByRole('button', { name: 'Open in diff' }))
    expect(open).toHaveBeenCalledWith('src/cart.ts', 4)
  })

  it('opens the diff where the quote really is when the cited lines were off', () => {
    const { open } = show(
      draft({
        certainty: 'likely',
        evidence: [citation],
        evidenceChecks: [{ status: 'confirmed', foundAt: { startLine: 9, endLine: 9 } }]
      })
    )
    fireEvent.click(evidenceToggle())
    expect(screen.getByText('The quote is at lines 9, not at the cited lines.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open in diff' }))
    expect(open).toHaveBeenCalledWith('src/cart.ts', 9)
  })

  it('offers no diff for evidence in a file the pull request does not change', () => {
    show(
      draft({
        certainty: 'likely',
        evidence: [{ ...citation, filePath: 'src/tax.ts' }],
        evidenceChecks: [{ status: 'confirmed' }]
      })
    )
    fireEvent.click(evidenceToggle())
    expect(screen.getByText('src/tax.ts:4–5')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open in diff' })).toBeNull()
  })

  it('shows a contradicted finding with the reason and the code that is really there', () => {
    const { certainty } = show(
      draft({
        severity: 'error',
        certainty: 'contradicted',
        evidence: [{ ...citation, quote: 'sum -= item' }],
        evidenceChecks: [
          { status: 'refuted', reason: 'text-mismatch', actual: '    sum += item\n  }' }
        ]
      })
    )
    expect(certainty()).toBe('contradicted')
    // Open without a click: the reason is what makes the mark useful.
    expect(screen.getByText('Not in the file')).toBeTruthy()
    expect(screen.getByText('The file has other text at the cited lines:')).toBeTruthy()
    expect(screen.getByLabelText('Quoted code').textContent).toBe('sum -= item')
    const actual = screen.getByLabelText('Code in the file')
    expect(within(actual).getByText('4')).toBeTruthy()
    expect(within(actual).getByText('5')).toBeTruthy()
    expect(actual.textContent).toContain('sum += item')
  })

  it('shows evidence of a kind it does not know as not checked, with its data', () => {
    const { certainty } = show(
      draft({
        certainty: 'uncertain',
        evidence: [{ kind: 'emulator-recording', screen: 'Checkout', frames: 12 }],
        evidenceChecks: [{ status: 'unchecked', reason: 'unknown-kind' }]
      })
    )
    expect(certainty()).toBe('uncertain')
    fireEvent.click(evidenceToggle())
    expect(screen.getByText('Not checked')).toBeTruthy()
    expect(screen.getByText('emulator-recording')).toBeTruthy()
    expect(
      screen.getByText('This version of Orca cannot check this kind of evidence.')
    ).toBeTruthy()
    expect(JSON.parse(screen.getByLabelText('Evidence data').textContent ?? '')).toEqual({
      screen: 'Checkout',
      frames: 12
    })
  })

  it('renders what an agent quotes as text, never as markup or links', () => {
    const hostile =
      '<img src=x onerror="alert(1)"> [open](javascript:alert(2)) <a href="https://example.invalid">x</a>'
    const { container } = show(
      draft({
        certainty: 'contradicted',
        evidence: [{ ...citation, quote: hostile, note: hostile }],
        evidenceChecks: [{ status: 'refuted', reason: 'text-mismatch', actual: hostile }],
        codeExcerpt: { startLine: 5, lines: [hostile] }
      })
    )
    expect(screen.getByLabelText('Quoted code').textContent).toBe(hostile)
    expect(screen.getByLabelText('Code in the file').textContent).toContain(hostile)
    expect(screen.getByLabelText('Commented code').textContent).toContain(hostile)
    expect(container.querySelectorAll('img, a, script, iframe')).toHaveLength(0)
  })

  it('shows the commented code with its line numbers above the comment', () => {
    show(
      draft({
        certainty: 'uncertain',
        codeExcerpt: { startLine: 4, lines: ['    sum += item', '  }'], truncated: true }
      })
    )
    const code = screen.getByLabelText('Commented code')
    expect(within(code).getByText('4')).toBeTruthy()
    expect(within(code).getByText('5')).toBeTruthy()
    expect(code.textContent).toContain('sum += item')
    expect(code.textContent?.endsWith('…')).toBe(true)
    const body = screen.getByTestId('draft-body')
    expect(code.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lets the user change the severity and remove it', async () => {
    const { onChanged } = show(draft({ severity: 'warning', certainty: 'uncertain' }))
    expect(screen.getByRole('button', { name: 'Severity: Warning' })).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Error' }))
    await waitFor(() => expect(updateDraft).toHaveBeenCalledWith('d1', { severity: 'error' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'No severity' }))
    await waitFor(() => expect(updateDraft).toHaveBeenLastCalledWith('d1', { severity: null }))
  })

  it('does not send a severity that is already set', () => {
    show(draft({ severity: 'warning' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Warning' }))
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it('shows the severity as text when the host would drop a change of it', () => {
    const { container } = show(draft({ severity: 'warning', certainty: 'uncertain' }), {
      severityEditable: false
    })
    expect(container.querySelector('[data-severity="warning"]')?.textContent).toBe('Warning')
    expect(screen.queryByRole('button', { name: /^Severity:/ })).toBeNull()
    cleanup()
    show(draft({ certainty: 'uncertain' }), { severityEditable: false })
    expect(screen.queryByText('No severity')).toBeNull()
  })

  it('shows the severity of a published draft without a way to change it', () => {
    const { container, certainty } = show(draft({ state: 'published', severity: 'error' }))
    expect(container.querySelector('[data-severity="error"]')?.textContent).toBe('Error')
    expect(screen.queryByRole('button', { name: /^Severity:/ })).toBeNull()
    expect(certainty()).toBeNull()
  })
})
