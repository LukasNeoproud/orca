// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import { GitGraphDialog, type GitGraphDialogProps } from './git-graph-dialog'

// happy-dom gives the scroll element no height, so the real virtualizer renders no rows.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 24,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 24 })),
    scrollToIndex: () => undefined
  })
}))

afterEach(cleanup)

const oid = (char: string): string => char.repeat(40)

function commit(char: string, parent: string | null, subject: string): GitHistoryItem {
  return {
    id: oid(char),
    parentIds: parent ? [oid(parent)] : [],
    subject,
    message: `${subject}\n\nbody of ${subject}`,
    displayId: oid(char).slice(0, 7),
    author: 'Ada',
    timestamp: 1_700_000_000_000,
    references: []
  }
}

function page(
  items: GitHistoryItem[],
  overrides: Partial<GitHistoryResult> = {}
): GitHistoryResult {
  return {
    items,
    currentRef: { id: 'refs/heads/main', name: 'main', revision: oid('a'), category: 'branches' },
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore: false,
    limit: 200,
    scope: 'all',
    ...overrides
  }
}

function renderDialog(
  props: Partial<GitGraphDialogProps> & Pick<GitGraphDialogProps, 'onLoadHistory'>
) {
  const onOpenChange = vi.fn()
  render(<GitGraphDialog open onOpenChange={onOpenChange} {...props} />, {
    wrapper: TooltipProvider
  })
  return { onOpenChange }
}

describe('GitGraphDialog', () => {
  it('lists commits with their local, remote and tag refs', async () => {
    const head = commit('a', 'b', 'Head commit')
    head.references = [
      { id: 'refs/heads/main', name: 'main', category: 'branches' },
      { id: 'refs/remotes/origin/feature', name: 'origin/feature', category: 'remote branches' },
      { id: 'refs/tags/v1', name: 'v1', category: 'tags' }
    ]
    const onLoadHistory = vi.fn(async () => page([head, commit('b', null, 'Root commit')]))
    renderDialog({ onLoadHistory })

    await screen.findByText('Root commit')
    expect(onLoadHistory).toHaveBeenCalledWith(0)
    const firstRow = screen.getAllByTestId('git-graph-row')[0]!
    expect(firstRow.textContent).toContain('main')
    expect(firstRow.textContent).toContain('origin/feature')
    expect(firstRow.textContent).toContain('v1')
  })

  it('pages with the number of commits already shown', async () => {
    const onLoadHistory = vi.fn(async (skip: number) =>
      skip === 0
        ? page([commit('a', 'b', 'First page')], { hasMore: true })
        : page([commit('b', null, 'Second page')])
    )
    renderDialog({ onLoadHistory })

    await screen.findByText('Second page')
    expect(onLoadHistory.mock.calls.map(([skip]) => skip)).toEqual([0, 1])
  })

  it('does not page a host that ignored the all-refs request', async () => {
    const onLoadHistory = vi.fn(async () =>
      page([commit('a', null, 'Only branch')], { hasMore: true, scope: undefined })
    )
    renderDialog({ onLoadHistory })

    await screen.findByText('Only branch')
    await screen.findByText(/older Orca/)
    expect(onLoadHistory).toHaveBeenCalledTimes(1)
  })

  it('shows the selected commit with its files and closes when one is opened', async () => {
    const head = commit('a', null, 'Head commit')
    const entry = { path: 'src/app.ts', status: 'modified' as const }
    const onLoadCommitFiles = vi.fn(async () => [entry])
    const onOpenCommitFile = vi.fn()
    const { onOpenChange } = renderDialog({
      onLoadHistory: async () => page([head]),
      onLoadCommitFiles,
      onOpenCommitFile
    })

    fireEvent.click(await screen.findByTestId('git-graph-row'))
    await screen.findByText('body of Head commit')
    fireEvent.click(await screen.findByTestId('git-history-commit-file'))

    await waitFor(() =>
      expect(onOpenCommitFile).toHaveBeenCalledWith(head, entry, expect.anything())
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
