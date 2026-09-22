import { describe, expect, it } from 'vitest'
import { buildBacklogTaskHandoffPrompt } from './backlog-task-handoff-prompt'

describe('buildBacklogTaskHandoffPrompt', () => {
  it('preserves Markdown and carries the latest checkbox state, including multiline criteria', () => {
    expect(
      buildBacklogTaskHandoffPrompt({
        id: 'TASK-9',
        title: 'Keep Markdown intact',
        status: 'To Do',
        priority: null,
        description: '    const untouched = true\n\n```ts\nrun()\n```',
        acceptanceCriteria: [
          { index: 1, text: 'Already done', checked: true },
          { index: 2, text: 'First line\nsecond line\n\n    code sample', checked: false }
        ]
      })
    ).toBe(`# Backlog task TASK-9: Keep Markdown intact

## Description

    const untouched = true

\`\`\`ts
run()
\`\`\`

## Acceptance criteria

- [x] 1. Already done
- [ ] 2. First line
  second line
${'  '}
      code sample`)
  })
})
