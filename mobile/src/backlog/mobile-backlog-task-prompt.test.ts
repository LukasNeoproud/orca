import { describe, expect, it } from 'vitest'
import { buildMobileBacklogTaskPrompt } from './mobile-backlog-task-prompt'

describe('buildMobileBacklogTaskPrompt', () => {
  it('includes fresh Markdown and checked acceptance criteria', () => {
    const prompt = buildMobileBacklogTaskPrompt({
      id: 'TASK-20',
      title: 'Fresh title',
      status: 'To Do',
      priority: null,
      description: '**Fresh description**',
      acceptanceCriteria: [
        { index: 1, text: 'Done', checked: true },
        { index: 2, text: 'First line\nSecond line', checked: false }
      ]
    })

    expect(prompt).toContain('# Backlog task TASK-20: Fresh title')
    expect(prompt).toContain('**Fresh description**')
    expect(prompt).toContain('- [x] 1. Done')
    expect(prompt).toContain('- [ ] 2. First line\n  Second line')
  })
})
