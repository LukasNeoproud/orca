// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import BacklogTaskDetail from './BacklogTaskDetail'

afterEach(cleanup)
describe('Backlog acceptance-criteria presentation', () => {
  it('counts checked criteria and preserves Markdown and accessible completion labels', () => {
    render(
      <BacklogTaskDetail
        task={{
          id: 'TASK-1',
          title: 'Parser support',
          status: 'In Progress',
          priority: 'high',
          description: 'Keep **existing behavior**.',
          acceptanceCriteria: [
            { index: 1, text: 'Preserve **Unicode**', checked: true },
            { index: 2, text: 'Handle `empty input`', checked: false }
          ]
        }}
      />
    )
    expect(screen.getByRole('heading', { name: 'Acceptance criteria 1/2' })).toBeTruthy()
    expect(screen.getByText('Unicode').tagName).toBe('STRONG')
    expect(screen.getByText('empty input').tagName).toBe('CODE')
    expect(screen.getByText('Met:').closest('li')?.className).toContain('text-muted-foreground')
    expect(screen.getByText('Not met:').closest('li')?.className).not.toContain(
      'text-muted-foreground'
    )
    expect(screen.getByRole('heading', { name: 'Parser support' })).toBeTruthy()
  })
})
