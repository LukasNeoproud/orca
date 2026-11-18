// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitMergedBranch } from '../../../../../../shared/git-merged-branch-cleanup'
import { GitBranchCleanupDialog } from './git-branch-cleanup-dialog'
import type { GitBranchCleanupActions } from './use-git-branch-cleanup'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(cleanup)

const merged: GitMergedBranch = {
  name: 'feature/merged',
  head: 'a'.repeat(40),
  category: 'merged',
  upstreamGone: false,
  remote: { remote: 'origin', branch: 'feature/merged', inSync: true }
}
const gone: GitMergedBranch = {
  name: 'feature/gone',
  head: 'b'.repeat(40),
  category: 'merged',
  upstreamGone: true
}
const fresh: GitMergedBranch = {
  name: 'feature/fresh',
  head: 'c'.repeat(40),
  category: 'never-pushed',
  upstreamGone: false
}
const open: GitMergedBranch = {
  name: 'feature/open',
  head: 'd'.repeat(40),
  category: 'in-workspace',
  upstreamGone: false,
  worktreePath: '/repos/app-feature-open'
}
const target = 'refs/remotes/origin/main'

function renderDialog(branches: GitMergedBranch[], remoteFresh = true) {
  const actions = {
    load: vi.fn<GitBranchCleanupActions['load']>(async () => ({
      targetRef: target,
      targets: [target],
      remoteFresh,
      branches
    })),
    deleteBranches: vi.fn<GitBranchCleanupActions['deleteBranches']>(async (requests) => ({
      deleted: requests.map((request) => request.name),
      remoteDeleted: [],
      failures: []
    }))
  }
  const onOpenChange = vi.fn()
  const onDeleted = vi.fn()
  render(
    <GitBranchCleanupDialog actions={actions} onOpenChange={onOpenChange} onDeleted={onDeleted} />
  )
  return { actions, onOpenChange, onDeleted }
}

function checkboxFor(name: string): HTMLElement {
  return screen.getByText(name).closest('label')!.querySelector('[role="checkbox"]')!
}

describe('GitBranchCleanupDialog', () => {
  it('selects only merged and pushed branches, and deletes locally by default', async () => {
    const { actions, onOpenChange, onDeleted } = renderDialog([merged, gone, fresh, open])
    await screen.findByText('feature/merged')
    expect(screen.getByText('Merged into origin/main')).toBeTruthy()
    expect(screen.getByText('also on origin')).toBeTruthy()
    expect(screen.getByText('remote branch deleted')).toBeTruthy()
    expect(screen.getByText('app-feature-open')).toBeTruthy()
    expect(checkboxFor('feature/open')).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected (2)' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(actions.deleteBranches).toHaveBeenCalledWith(
      [
        { name: 'feature/merged', head: merged.head, deleteRemote: false },
        { name: 'feature/gone', head: gone.head, deleteRemote: false }
      ],
      target
    )
    expect(onDeleted).toHaveBeenCalledOnce()
  })

  it('includes a never-pushed branch and the remote copies once those are ticked', async () => {
    const { actions } = renderDialog([merged, fresh])
    await screen.findByText('feature/merged')

    fireEvent.click(checkboxFor('feature/fresh'))
    fireEvent.click(screen.getByText('Also delete them on the remote (1)'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected (2)' }))

    await waitFor(() => expect(actions.deleteBranches).toHaveBeenCalledOnce())
    expect(actions.deleteBranches.mock.calls[0]![0]).toEqual([
      { name: 'feature/merged', head: merged.head, deleteRemote: true },
      { name: 'feature/fresh', head: fresh.head, deleteRemote: true }
    ])
  })

  it('says when nothing is merged and when the remote was unreachable', async () => {
    renderDialog([], false)
    expect(await screen.findByText('No merged branches to clean up.')).toBeTruthy()
    expect(screen.getByText(/could not be reached/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete selected (0)' })).toHaveProperty(
      'disabled',
      true
    )
  })
})
