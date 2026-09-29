// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentManagerPreview } from './AgentManagerPreview'

vi.mock('@/components/dashboard-popout/AgentTerminalPreview', () => ({
  AgentTerminalPreview: (props: { ptyId: string; readOnly?: boolean }) => (
    <div
      data-testid="terminal-preview"
      data-pty-id={props.ptyId}
      data-read-only={String(props.readOnly === true)}
    />
  )
}))

vi.mock('@/components/ui/hover-card', () => ({
  HoverCard: ({
    children,
    onOpenChange
  }: {
    children: ReactNode
    onOpenChange: (open: boolean) => void
  }) => (
    <div onMouseEnter={() => onOpenChange(true)} onFocus={() => onOpenChange(true)}>
      {children}
    </div>
  ),
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

describe('AgentManagerPreview', () => {
  afterEach(cleanup)

  it('opens the expanded preview from the trigger', () => {
    render(
      <AgentManagerPreview session={{ sessionId: 'pty-1' }} label="Build agent">
        <button type="button">Build agent row</button>
      </AgentManagerPreview>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Build agent row' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByTestId('terminal-preview')).toHaveLength(1)
  })

  it('uses a read-only terminal for hover and expanded previews', () => {
    render(
      <AgentManagerPreview session={{ sessionId: 'pty-1' }} label="Build agent">
        <button type="button">Build agent row</button>
      </AgentManagerPreview>
    )

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Build agent row' }).parentElement!)

    const hoverPreview = screen.getByTestId('terminal-preview')
    expect(hoverPreview).toHaveAttribute('data-pty-id', 'pty-1')
    expect(hoverPreview).toHaveAttribute('data-read-only', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))

    const previews = screen.getAllByTestId('terminal-preview')
    expect(previews).toHaveLength(1)
    expect(previews.every((preview) => preview.dataset.readOnly === 'true')).toBe(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByText('Read-only').length).toBeGreaterThan(0)
  })
})
