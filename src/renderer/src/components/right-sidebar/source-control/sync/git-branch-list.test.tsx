// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitBranchEntry } from '../../../../../../shared/git-branch-list'
import { GitBranchList } from './git-branch-list'
import type { GitBranchListActions } from './use-git-branch-list'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

afterEach(cleanup)

const oid = (char: string): string => char.repeat(40)
const branches: GitBranchEntry[] = [
  {
    kind: 'local',
    name: 'feature/login',
    head: oid('a'),
    subject: 'Add login',
    current: false,
    protected: false,
    upstream: { name: 'origin/feature/login', ahead: 2, behind: 1, gone: false }
  },
  {
    kind: 'local',
    name: 'main',
    head: oid('b'),
    subject: 'Release',
    current: true,
    protected: true,
    worktreePath: '/repos/app'
  },
  {
    kind: 'remote',
    name: 'origin/feature/login',
    head: oid('a'),
    subject: 'Add login',
    current: false,
    protected: false
  }
]

function renderList() {
  const actions: GitBranchListActions = {
    list: vi.fn(async () => ({ branches })),
    deleteBranch: vi.fn(async () => ({ remoteDeleted: true })),
    renameBranch: vi.fn(async () => undefined),
    cleanup: { load: vi.fn(), deleteBranches: vi.fn() },
    openWorkspace: vi.fn(() => true),
    createWorkspace: vi.fn()
  }
  const onSelectCommit = vi.fn()
  const onChanged = vi.fn()
  render(
    <GitBranchList
      actions={actions}
      revision={0}
      onSelectCommit={onSelectCommit}
      onChanged={onChanged}
    />,
    { wrapper: TooltipProvider }
  )
  return { actions, onSelectCommit, onChanged }
}

describe('GitBranchList', () => {
  it('groups branches, shows tracking state and jumps to a tip on click', async () => {
    const { onSelectCommit } = renderList()

    expect(await screen.findByText('Local (2)')).toBeTruthy()
    expect(screen.getByText('Remote (1)')).toBeTruthy()
    expect(screen.getByText('↑2')).toBeTruthy()
    expect(screen.getByText('↓1')).toBeTruthy()

    fireEvent.click(screen.getByText('feature/login'))
    expect(onSelectCommit).toHaveBeenCalledWith(oid('a'))
  })

  it('filters by name', async () => {
    renderList()
    await screen.findByText('main')

    fireEvent.change(screen.getByLabelText('Filter branches'), { target: { value: 'login' } })

    expect(screen.queryByText('main')).toBeNull()
    expect(screen.getByText('Local (1)')).toBeTruthy()
  })

  it('deletes a branch with its remote copy after confirmation', async () => {
    const { actions, onChanged } = renderList()
    await screen.findByText('feature/login')

    const menus = screen.getAllByRole('button', { name: 'Branch actions' })
    fireEvent.keyDown(menus[0]!, { key: 'Enter' })
    fireEvent.keyDown(await screen.findByText('Delete…'), { key: 'Enter' })
    fireEvent.click(await screen.findByText('Also delete origin/feature/login'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(actions.deleteBranch).toHaveBeenCalledWith({
      kind: 'local',
      name: 'feature/login',
      head: oid('a'),
      deleteRemote: true
    })
  })
})
