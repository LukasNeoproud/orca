import type { AgentJournalRenderItem } from './agent-session-journal-types'

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '[unserializable]'
  }
}

function messageText(item: Extract<AgentJournalRenderItem['body'], { kind: 'message' }>): string {
  return item.blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.text
      }
      if (block.type === 'image-ref') {
        return `[image: ${block.path ?? block.url ?? block.alt ?? 'image'}]`
      }
      if (block.type === 'tool-call') {
        return `[tool ${block.name}]\n${json(block.input)}`
      }
      if (block.type === 'tool-result') {
        return `[tool result${block.isError ? ' error' : ''}]\n${block.output}`
      }
      return `[subagents]\n${json(block.agents)}`
    })
    .join('\n')
}

export function formatAgentSessionBranchHistory(items: readonly AgentJournalRenderItem[]): string {
  const rows = items.flatMap((item) => {
    const body = item.body
    if (body.kind === 'message') {
      return [`${body.role.toUpperCase()}:\n${messageText(body)}`]
    }
    if (body.kind === 'tool-call') {
      const output = body.output?.head ? `\nOUTPUT:\n${body.output.head}` : ''
      return [`TOOL ${body.name} (${body.state}):\n${json(body.input)}${output}`]
    }
    if (body.kind === 'diff') {
      return [`DIFF ${body.path}:\n${body.patch.head}`]
    }
    if (body.kind === 'approval') {
      return [`APPROVAL: ${body.title}\n${body.detail ?? ''}`]
    }
    if (body.kind === 'question') {
      return [`QUESTION: ${body.question}`]
    }
    return body.turnLifecycle ? [] : [`STATUS: ${body.text}`]
  })
  return rows.join('\n\n').trim()
}

export function portableAgentSessionBranchPrompt(history: string, instruction: string): string {
  return [
    'The following is the exact source conversation history selected for this branch.',
    '',
    history,
    '',
    'Continue only with this reviewed branch instruction:',
    '',
    instruction
  ].join('\n')
}
