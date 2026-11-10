import { describe, expect, it } from 'vitest'
import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'
import { projectClaudeTaskToolCalls } from './native-chat-claude-task-tool-calls'

function message(id: string, blocks: NativeChatBlock[]): NativeChatMessage {
  return { id, source: 'transcript', role: 'assistant', timestamp: null, blocks }
}
const call = (
  name: string,
  input: unknown,
  callId: string,
  state: 'completed' | 'failed' | 'running' = 'completed'
): NativeChatBlock => ({
  type: 'tool-call',
  name,
  input,
  callId,
  state
})
const result = (output: string, callId: string): NativeChatBlock => ({
  type: 'tool-result',
  output,
  callId
})

function todos(projectedMessage: NativeChatMessage | undefined): unknown {
  const block = projectedMessage?.blocks.find((entry) => entry.type === 'tool-call')
  return block?.type === 'tool-call' ? block.input : undefined
}

describe('projectClaudeTaskToolCalls', () => {
  const created = message('m1', [
    call('TaskCreate', { subject: 'Alpha', description: 'Alpha' }, 'c1'),
    result('Task #1 created successfully: Alpha', 'c1'),
    call('TaskCreate', { subject: 'Beta', activeForm: 'Doing Beta' }, 'c2'),
    result('Task #2 created successfully: Beta', 'c2')
  ])
  const started = message('m2', [
    call('TaskUpdate', { taskId: '1', status: 'in_progress' }, 'c3'),
    result('Updated task #1 status', 'c3')
  ])

  it('redraws each call as the whole list after it', () => {
    const [first, second] = projectClaudeTaskToolCalls([created, started])
    expect(first?.blocks.filter((block) => block.type === 'tool-call')).toHaveLength(2)
    expect(first?.blocks[0]).toMatchObject({
      name: 'TodoWrite',
      input: { todos: [{ content: 'Alpha', status: 'pending' }] }
    })
    expect(todos(second)).toEqual({
      todos: [
        { content: 'Alpha', status: 'in_progress' },
        { content: 'Beta', status: 'pending', activeForm: 'Doing Beta' }
      ]
    })
  })

  it('drops a deleted task, names one it never saw created, and ignores a failed call', () => {
    const [, , later] = projectClaudeTaskToolCalls([
      created,
      started,
      message('m3', [
        call('TaskUpdate', { taskId: '2', status: 'deleted' }, 'c4'),
        call('TaskUpdate', { taskId: '7', status: 'completed' }, 'c5'),
        call('TaskUpdate', { taskId: '1', status: 'completed' }, 'c6', 'failed')
      ])
    ])
    expect(later?.blocks.at(-1)).toMatchObject({
      input: {
        todos: [
          { content: 'Alpha', status: 'in_progress' },
          { content: '#7', status: 'completed' }
        ]
      }
    })
  })

  it('numbers a call still running as the CLI will, and keeps settled rows’ identity', () => {
    const running = message('m4', [call('TaskCreate', { subject: 'Gamma' }, 'c7', 'running')])
    const once = projectClaudeTaskToolCalls([created, started, running])
    const again = projectClaudeTaskToolCalls([created, started, running])
    expect(again[0]).toBe(once[0])
    expect(again[2]).toBe(once[2])
    const done = message('m5', [
      call('TaskUpdate', { taskId: '3', status: 'completed' }, 'c8'),
      result('Updated task #3 status', 'c8')
    ])
    expect(todos(projectClaudeTaskToolCalls([created, started, running, done])[3])).toMatchObject({
      todos: [{ content: 'Alpha' }, { content: 'Beta' }, { content: 'Gamma', status: 'completed' }]
    })
    const untouched = message('m6', [{ type: 'text', text: 'hello' }])
    expect(projectClaudeTaskToolCalls([untouched])[0]).toBe(untouched)
  })
})
