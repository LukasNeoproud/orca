import type { BacklogTask } from '../../../shared/backlog-types'

export function buildBacklogTaskHandoffPrompt(task: BacklogTask): string {
  const description = task.description
  const criteria = task.acceptanceCriteria ?? []
  return [
    `# Backlog task ${task.id}: ${task.title}`,
    ...(description?.trim() ? ['', '## Description', '', description] : []),
    ...(criteria.length
      ? [
          '',
          '## Acceptance criteria',
          '',
          ...criteria.map((criterion) => {
            const [first = '', ...continuation] = criterion.text.split('\n')
            return [
              `- [${criterion.checked ? 'x' : ' '}] ${criterion.index}. ${first}`,
              ...continuation.map((line) => `  ${line}`)
            ].join('\n')
          })
        ]
      : [])
  ].join('\n')
}
