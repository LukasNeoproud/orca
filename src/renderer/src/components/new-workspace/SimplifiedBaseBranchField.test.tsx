// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimplifiedBaseBranchField } from './SimplifiedBaseBranchField'

const mocks = vi.hoisted(() => ({
  search: vi.fn().mockResolvedValue([
    { refName: 'main', localBranchName: 'main' },
    { refName: 'origin/main', localBranchName: 'main' }
  ])
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ repos: [{ id: 'repo', path: '/repo' }] }) }
}))
vi.mock('@/runtime/runtime-repo-client', () => ({
  searchRuntimeRepoBaseRefDetails: mocks.search
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Create from branch suggestions', () => {
  it('searches the selected host and selects the full remote ref without submitting', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    render(
      <SimplifiedBaseBranchField
        repoId="repo"
        hostId="ssh:server"
        value="ma"
        onChange={onChange}
        onSubmit={onSubmit}
      />
    )
    const input = screen.getByRole('combobox', { name: 'Create from' })
    fireEvent.focus(input)
    await screen.findByRole('option', { name: 'origin/main' })
    expect(mocks.search).toHaveBeenCalledWith('ssh:server', 'repo', 'ma', 30)
    expect(screen.queryByText(/Create branch/)).toBeNull()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('origin/main')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('discards stale suggestions while a new query is loading', async () => {
    const props = { repoId: 'repo', onChange: vi.fn(), onSubmit: vi.fn() }
    const { rerender } = render(<SimplifiedBaseBranchField {...props} value="ma" />)
    fireEvent.focus(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: 'main' })
    mocks.search.mockResolvedValueOnce([{ refName: 'develop', localBranchName: 'develop' }])
    rerender(<SimplifiedBaseBranchField {...props} value="dev" />)
    expect(screen.queryByRole('option', { name: 'main' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('option', { name: 'develop' })).toBeTruthy())
  })
})
