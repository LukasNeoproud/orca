// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { GitAnnotateGutterMenuItems } from './GitAnnotateGutterMenuItems'
import type { GitAnnotateMenu } from './use-monaco-git-annotate'

afterEach(cleanup)

function menu(overrides: Partial<GitAnnotateMenu> = {}): GitAnnotateMenu {
  return {
    annotated: false,
    disabledReason: null,
    toggleAnnotations: vi.fn(),
    showLineHistory: vi.fn(),
    ...overrides
  }
}

function renderItems(value: GitAnnotateMenu | null, line: number): void {
  render(
    <DropdownMenu open modal={false}>
      <DropdownMenuTrigger />
      <DropdownMenuContent>
        <GitAnnotateGutterMenuItems menu={value} line={line} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('GitAnnotateGutterMenuItems', () => {
  it('toggles the annotations and asks for the history of the invoked line', () => {
    const value = menu()
    renderItems(value, 7)

    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Annotate with Git Blame' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(value.toggleAnnotations).toHaveBeenCalledTimes(1)

    cleanup()
    renderItems(value, 7)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show History for Line 7' }))
    expect(value.showLineHistory).toHaveBeenCalledExactlyOnceWith(7, 7)
  })

  it('shows the toggle as checked while the file is annotated', () => {
    renderItems(menu({ annotated: true }), 1)

    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Annotate with Git Blame' })
        .getAttribute('aria-checked')
    ).toBe('true')
  })

  it('disables both actions with the reason when the host runs an older Orca', () => {
    const value = menu({ disabledReason: 'This host runs an older Orca. Update it to annotate.' })
    renderItems(value, 3)

    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Annotate with Git Blame' })
    const history = screen.getByRole('menuitem', { name: 'Show History for Line 3' })
    expect(toggle.getAttribute('aria-disabled')).toBe('true')
    expect(history.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('This host runs an older Orca. Update it to annotate.')).toBeTruthy()

    fireEvent.click(toggle)
    fireEvent.click(history)
    expect(value.toggleAnnotations).not.toHaveBeenCalled()
    expect(value.showLineHistory).not.toHaveBeenCalled()
  })

  it('renders nothing where git cannot annotate the file', () => {
    renderItems(null, 1)

    expect(screen.queryAllByRole('menuitem')).toEqual([])
    expect(screen.queryAllByRole('menuitemcheckbox')).toEqual([])
  })
})
