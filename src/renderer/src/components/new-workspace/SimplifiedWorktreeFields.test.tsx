// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimplifiedWorktreeFields } from './SimplifiedWorktreeFields'
import type { SimplifiedWorktreeForm } from './use-simplified-worktree-form'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'

const mocks = vi.hoisted(() => ({ updateRepo: vi.fn().mockResolvedValue(true) }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      updateRepo: mocks.updateRepo,
      settings: null,
      repos: [
        {
          id: 'repo',
          executionHostId: 'local',
          simplifiedWorktreeLayout: 'nested',
          simplifiedWorktreeLocation: 'orca-default'
        }
      ]
    })
  }
}))
vi.mock('@/lib/open-registered-worktree', () => ({ openRegisteredWorktree: vi.fn() }))
vi.mock('./SimplifiedBranchField', () => ({ SimplifiedBranchField: () => null }))
vi.mock('./NewWorkspaceComposerNameSection', () => ({
  NewWorkspaceComposerNameSection: () => null
}))
afterEach(cleanup)

describe('simplified worktree project defaults', () => {
  it('offers a late issue suggestion independently of edited branch and custom labels', () => {
    const form = {
      branch: 'my-edited-branch',
      name: 'my-worktree',
      displayName: 'My label',
      customName: 'my-worktree',
      customLabel: 'My label',
      root: '.worktrees',
      layout: 'nested',
      setBranch: vi.fn(),
      setRemote: vi.fn()
    } as unknown as SimplifiedWorktreeForm
    const card = {
      repoId: 'repo',
      name: 'my-edited-branch',
      onNameValueChange: vi.fn()
    } as unknown as NewWorkspaceComposerCardProps
    const { rerender } = render(
      <SimplifiedWorktreeFields form={form} card={card} onClose={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: 'Use suggested branch name' })).toBeNull()
    rerender(
      <SimplifiedWorktreeFields
        form={form}
        card={card}
        suggestedBranchName="team/ENG-123-fix"
        onClose={vi.fn()}
      />
    )
    expect(form.setBranch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use suggested branch name' }))
    expect(form.setBranch).toHaveBeenCalledWith('team/ENG-123-fix')
    expect(card.onNameValueChange).toHaveBeenCalledWith('team/ENG-123-fix')
    expect(form.customName).toBe('my-worktree')
    expect(form.customLabel).toBe('My label')
  })

  it('saves the Orca preset with its wire marker and clears the previous project root', async () => {
    const form = {
      branch: 'feature',
      name: 'feature',
      displayName: 'feature',
      customName: null,
      customLabel: null,
      root: '',
      layout: 'nested',
      pending: false,
      preview: {
        path: '/workspaces/project/feature',
        branch: { kind: 'local', name: 'feature' },
        destinationExists: false,
        needsLocalIgnore: false
      }
    } as unknown as SimplifiedWorktreeForm
    const card = {
      repoId: 'repo',
      selectedRepoExecutionHostId: 'local',
      name: 'feature'
    } as unknown as NewWorkspaceComposerCardProps
    render(<SimplifiedWorktreeFields form={form} card={card} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save as project default' }))
    })
    expect(mocks.updateRepo).toHaveBeenCalledWith(
      'repo',
      {
        worktreeBasePath: '',
        simplifiedWorktreeLayout: 'nested',
        simplifiedWorktreeLocation: 'orca-default'
      },
      { hostId: 'local' }
    )
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDefined()
  })
})
