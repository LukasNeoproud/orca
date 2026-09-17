// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BacklogTask } from '../../../../shared/backlog-types'
import BacklogTaskDetail from './BacklogTaskDetail'

const baseTask: BacklogTask = {
  id: 'TASK-3',
  title: 'Render task details',
  status: 'In Progress',
  priority: 'High'
}

afterEach(cleanup)

describe('BacklogTaskDetail', () => {
  it('renders Markdown structure in the description and contains wide content', () => {
    const longUrl = `https://example.com/${'segment'.repeat(40)}`
    const { container } = render(
      <BacklogTaskDetail
        task={{
          ...baseTask,
          description: `# Overview\n\nA **bold** and *italic* paragraph with [a link](${longUrl}) and \`inline\`.\n\n- first\n- second\n\n\`\`\`ts\nconst value = '${'long'.repeat(70)}'\n\`\`\``
        }}
      />
    )

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText('inline').tagName).toBe('CODE')
    expect(screen.getByText('first').closest('li')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'a link' })
    expect(link.getAttribute('href')).toBe(longUrl)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(container.querySelector('pre')?.className).toContain('overflow-x-auto')
    expect(container.querySelector('pre')?.className).toContain('max-w-full')
    expect(link.closest('div[class*="overflow-wrap:anywhere"]')).toBeTruthy()
  })

  it('renders Markdown criteria while preserving each checked state', () => {
    render(
      <BacklogTaskDetail
        task={{
          ...baseTask,
          acceptanceCriteria: [
            { index: 1, text: 'Uses **Markdown** with `code`', checked: true },
            { index: 2, text: 'Keeps *pending* visible', checked: false }
          ]
        }}
      />
    )

    const criteria = screen.getByRole('heading', { name: 'Acceptance criteria' }).nextElementSibling
    expect(criteria).toBeTruthy()
    const items = within(criteria as HTMLElement).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('☑')
    expect(items[1].textContent).toContain('☐')
    expect(within(items[0]).getByText('Markdown').tagName).toBe('STRONG')
    expect(within(items[0]).getByText('code').tagName).toBe('CODE')
    expect(within(items[1]).getByText('pending').tagName).toBe('EM')
  })

  it('renders plain text and omits an empty description', () => {
    const { rerender } = render(
      <BacklogTaskDetail task={{ ...baseTask, description: 'Plain text\nnext line' }} />
    )
    expect(screen.getByText(/Plain text/)).toBeTruthy()
    expect(screen.getByText(/Plain text/).querySelector('br')).toBeTruthy()

    rerender(<BacklogTaskDetail task={{ ...baseTask, description: '' }} />)
    expect(screen.queryByRole('heading', { name: 'Description' })).toBeNull()
    expect(screen.getByText('In Progress · High')).toBeTruthy()
  })

  it('does not expose scripts or unsafe link URLs from Markdown and raw HTML', () => {
    const { container } = render(
      <BacklogTaskDetail
        task={{
          ...baseTask,
          description:
            '[unsafe](javascript:alert(1)) <script>alert(2)</script> <a href="javascript:alert(3)" onclick="alert(4)">raw link</a>',
          acceptanceCriteria: [
            { index: 1, text: '<img src="x" onerror="alert(5)" />', checked: false }
          ]
        }}
      />
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onclick], [onerror]')).toBeNull()
    expect(container.querySelector('[href^="javascript:"]')).toBeNull()
    expect(screen.getByText('unsafe').closest('a')?.getAttribute('href')).toBeNull()
    expect(screen.getByText('raw link').closest('a')?.getAttribute('href')).toBeNull()
  })
})
