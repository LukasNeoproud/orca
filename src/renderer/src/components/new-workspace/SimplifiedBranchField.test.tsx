// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimplifiedBranchField } from './SimplifiedBranchField'

afterEach(cleanup)
// Slash-named locals come back fully qualified so they cannot collide with remote refs.
const branches = [
  { refName: 'refs/heads/feature/local', localBranchName: 'feature/local' },
  { refName: 'origin/remote', localBranchName: 'remote' }
]

describe('simplified branch combobox keyboard', () => {
  it('submits a typed name without requiring the new-branch option', () => {
    const submit = vi.fn()
    const select = vi.fn()
    render(
      <SimplifiedBranchField
        value="feature/new"
        branches={branches}
        onChange={vi.fn()}
        onSelect={select}
        onSubmit={submit}
      />
    )
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(submit).toHaveBeenCalledOnce()
    expect(select).not.toHaveBeenCalled()
  })
  it('selects the active local branch instead of submitting, then submits on Enter', () => {
    const submit = vi.fn()
    const select = vi.fn()
    render(
      <SimplifiedBranchField
        value="feature/local"
        branches={branches}
        onChange={vi.fn()}
        onSelect={select}
        onSubmit={submit}
      />
    )
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe('simplified-branch-option-0')
    expect(
      screen.getByRole('option', { name: 'feature/local' }).getAttribute('aria-selected')
    ).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(select).toHaveBeenCalledWith(branches[0])
    expect(submit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(submit).toHaveBeenCalledOnce()
  })
  it('requires explicit remote selection and closes its dropdown on Escape', () => {
    const select = vi.fn()
    render(
      <SimplifiedBranchField
        value="feature/local"
        branches={branches}
        onChange={vi.fn()}
        onSelect={select}
        onSubmit={vi.fn()}
      />
    )
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(select).toHaveBeenCalledWith(branches[1])
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('simplified branch labels', () => {
  it('shows locals and remotes without the refs/ namespace', () => {
    render(
      <SimplifiedBranchField
        value="feature"
        branches={[
          { refName: 'refs/heads/feature/local', localBranchName: 'feature/local' },
          { refName: 'refs/remotes/origin/feature/remote', localBranchName: 'feature/remote' }
        ]}
        onChange={vi.fn()}
        onSelect={vi.fn()}
        onSubmit={vi.fn()}
      />
    )
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: 'feature/local' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'origin/feature/remote' })).toBeTruthy()
  })
})
