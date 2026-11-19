// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView
} from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewDrafts } from './AzureDevOpsReviewDrafts'

vi.mock('@/lib/azure-devops-review-client', () => ({
  azureDevOpsReviewHostCastsVotes: async () => false,
  azureDevOpsReviewHostKeepsFindings: async () => true,
  publishAzureDevOpsReviewDrafts: vi.fn()
}))
vi.mock('./AzureDevOpsReviewDraftCard', () => ({
  AzureDevOpsReviewDraftCard: ({
    draft,
    selected
  }: {
    draft: AzureDevOpsReviewDraftView
    selected: boolean
  }) => (
    <li data-testid="draft" data-selected={selected}>
      {draft.body}
    </li>
  )
}))
vi.mock('./AzureDevOpsDraftComposer', () => ({ AzureDevOpsDraftComposer: () => null }))
vi.mock('./AzureDevOpsReviewPublishDialog', () => ({
  AzureDevOpsReviewPublishDialog: ({ draftIds }: { draftIds: string[] }) => (
    <div role="dialog">{draftIds.join(',')}</div>
  )
}))
// Why plain elements: the Radix menu and select need pointer capture and layout that happy-dom lacks.
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuSub: Pass,
    DropdownMenuSubTrigger: Pass,
    DropdownMenuSubContent: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({ onSelect, children }: { onSelect: () => void; children: string }) => (
      <button type="button" role="menuitem" onClick={onSelect}>
        {children}
      </button>
    ),
    DropdownMenuCheckboxItem: ({
      checked,
      onCheckedChange,
      children
    }: {
      checked: boolean
      onCheckedChange: () => void
      children: React.ReactNode
    }) => (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        onClick={onCheckedChange}
      >
        {children}
      </button>
    )
  }
})
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select aria-label="Sort drafts" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  )
}))

function draft(id: string, patch: Partial<AzureDevOpsReviewDraftView>): AzureDevOpsReviewDraftView {
  return {
    id,
    pullRequestKey: 'dev.azure.com/contoso+repo+7',
    kind: 'inline',
    filePath: 'src/cart.ts',
    anchor: { side: 'right', startLine: 5, endLine: 5 },
    threadId: null,
    threadStatus: null,
    body: id,
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

const DRAFTS = [
  draft('nit on tax', { severity: 'nit', certainty: 'likely', filePath: 'src/tax.ts' }),
  draft('hand-written', {
    author: { kind: 'user' },
    kind: 'general',
    filePath: null,
    anchor: null
  }),
  draft('warning on cart', { severity: 'warning', certainty: 'likely', createdAt: 2 }),
  draft('error on tax', { severity: 'error', certainty: 'uncertain', filePath: 'src/tax.ts' }),
  draft('old error', { severity: 'error', certainty: 'likely', outdated: true, createdAt: 3 }),
  draft('published', { severity: 'error', state: 'published' })
]

function detail(): AzureDevOpsReviewDetail {
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the drafts tab reads only `key`, `status`, `createdByMe` and `myVote` of the pull request.
    pullRequest: {
      key: 'dev.azure.com/contoso+repo+7',
      status: 'active',
      myVote: 'none'
    } as AzureDevOpsReviewDetail['pullRequest'],
    latestIteration: null,
    threads: [],
    changes: [
      { path: 'src/cart.ts', originalPath: null, changeType: 'edit', changeTrackingId: 1 },
      { path: 'src/tax.ts', originalPath: null, changeType: 'edit', changeTrackingId: 2 }
    ],
    drafts: DRAFTS,
    reviewWorktree: null
  }
}

async function renderDrafts(): Promise<void> {
  render(
    <AzureDevOpsReviewDrafts
      detail={detail()}
      onChanged={async () => undefined}
      onAskAi={() => undefined}
      onOpenInDiff={() => undefined}
    />
  )
  // Lets the capability answers land before looking at the list.
  await act(async () => {
    await Promise.resolve()
  })
}

// Published drafts sit in their own collapsed section, which sorting and filtering leave alone.
const shownDrafts = () =>
  screen
    .queryAllByTestId('draft')
    .filter((item) => !item.closest('details'))
    .map((item) => item.textContent)
const option = (name: RegExp) => screen.getByRole('menuitemcheckbox', { name })

describe('sorting and filtering the drafts tab', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('lists unpublished drafts by priority and switches to file order, remembering it', async () => {
    await renderDrafts()

    expect(shownDrafts()).toEqual([
      'old error',
      'error on tax',
      'warning on cart',
      'nit on tax',
      'hand-written'
    ])

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort drafts' }), {
      target: { value: 'file' }
    })

    expect(shownDrafts()).toEqual([
      'hand-written',
      'warning on cart',
      'old error',
      'nit on tax',
      'error on tax'
    ])
    cleanup()
    await renderDrafts()
    expect(shownDrafts()[0]).toBe('hand-written')
  })

  it('selects exactly the drafts the filter shows and publishes only them', async () => {
    await renderDrafts()

    fireEvent.click(option(/^Error/))
    fireEvent.click(option(/^Warning/))

    expect(shownDrafts()).toEqual(['old error', 'error on tax', 'warning on cart'])
    expect(screen.getByRole('status').textContent).toContain(
      'The filter hides 2 of 5 drafts, 1 of them without severity.'
    )
    // The outdated draft is shown but can never be published.
    fireEvent.click(screen.getByRole('button', { name: 'Select shown (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish selected (2)' }))

    expect(screen.getByRole('dialog').textContent).toBe('warning on cart,error on tax')
  })

  it('counts hidden drafts that stay selected, and narrows the selection to what is shown', async () => {
    await renderDrafts()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

    fireEvent.click(option(/^Likely/))

    expect(shownDrafts()).toEqual(['old error', 'warning on cart', 'nit on tax'])
    expect(screen.getByRole('status').textContent).toContain(
      'Hidden drafts selected for publishing: 2.'
    )
    expect(screen.getByRole('button', { name: 'Publish selected (4)' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Select shown (2)' }))

    expect(screen.getByRole('button', { name: 'Publish selected (2)' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).not.toContain('selected for publishing')
  })

  it('says so when nothing matches, and shows everything again once the filter is cleared', async () => {
    await renderDrafts()

    fireEvent.click(option(/^Suggestion/))

    expect(shownDrafts()).toEqual([])
    expect(screen.getByText('No draft matches the filter.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select shown (0)' })).toHaveProperty(
      'disabled',
      true
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])

    expect(shownDrafts()).toHaveLength(5)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('narrows by author and by file, with general comments under no file', async () => {
    await renderDrafts()

    fireEvent.click(option(/^You/))
    expect(shownDrafts()).toEqual(['hand-written'])

    fireEvent.click(option(/^You/))
    fireEvent.click(option(/^No file/))
    fireEvent.click(option(/^src\/tax\.ts/))
    expect(shownDrafts()).toEqual(['error on tax', 'nit on tax', 'hand-written'])
  })
})
