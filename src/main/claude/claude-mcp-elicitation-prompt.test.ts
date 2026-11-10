import { describe, expect, it } from 'vitest'
import type { ElicitationRequest, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import {
  claudeElicitationQuestions,
  claudeElicitationResult
} from './claude-mcp-elicitation-prompt'

const form: ElicitationRequest = {
  serverName: 'tickets',
  message: 'Create a ticket',
  mode: 'form',
  requestedSchema: {
    type: 'object',
    required: ['title', 'priority'],
    properties: {
      title: { type: 'string', title: 'Title' },
      priority: { type: 'string', enum: ['p1', 'p2'], enumNames: ['Urgent', 'Normal'] },
      estimate: { type: 'number', description: 'Days' },
      notify: { type: 'boolean' }
    }
  }
}

function answered(answers: Record<string, string | string[]>): PermissionResult {
  return { behavior: 'allow', updatedInput: { answers } }
}

describe('an MCP elicitation as a question card', () => {
  it('asks one question per field, with the request leading the first', () => {
    const questions = claudeElicitationQuestions(form)
    expect(questions.map((question) => question.header)).toEqual([
      'title',
      'priority',
      'estimate',
      'notify'
    ])
    expect(questions[0]?.question).toBe('tickets: Create a ticket\n\nTitle')
    expect(questions[1]?.options).toEqual([{ label: 'Urgent' }, { label: 'Normal' }])
    // An optional free-text field can be skipped; a required one cannot.
    expect(questions[0]?.options).toEqual([])
    expect(questions[2]?.options).toEqual([{ label: 'Skip' }])
    expect(questions[3]?.options).toEqual([{ label: 'Yes' }, { label: 'No' }])
  })

  it('answers the server in the types and values its schema asked for', () => {
    const questions = claudeElicitationQuestions(form)
    const text = (index: number): string => String(questions[index]?.question)
    expect(
      claudeElicitationResult(
        form,
        questions,
        answered({ [text(0)]: 'Crash', [text(1)]: 'Urgent', [text(2)]: 'Skip', [text(3)]: 'No' })
      )
    ).toEqual({ action: 'accept', content: { title: 'Crash', priority: 'p1', notify: false } })
    expect(
      claudeElicitationResult(
        form,
        questions,
        answered({ [text(0)]: 'Crash', [text(1)]: 'Normal', [text(2)]: '2.5', [text(3)]: 'Yes' })
      )
    ).toMatchObject({ content: { estimate: 2.5, notify: true, priority: 'p2' } })
  })

  it('declines a dismissed card and cancels an aborted one', () => {
    const questions = claudeElicitationQuestions(form)
    expect(claudeElicitationResult(form, questions, { behavior: 'deny', message: 'no' })).toEqual({
      action: 'decline'
    })
    expect(claudeElicitationResult(form, questions, null)).toEqual({ action: 'cancel' })
  })

  it('shows a sign-in link as one question the user confirms or declines', () => {
    const url: ElicitationRequest = {
      serverName: 'drive',
      message: 'Sign in to continue',
      mode: 'url',
      url: 'https://example.com/auth'
    }
    const questions = claudeElicitationQuestions(url)
    expect(questions).toHaveLength(1)
    expect(questions[0]?.question).toContain('https://example.com/auth')
    const text = String(questions[0]?.question)
    expect(claudeElicitationResult(url, questions, answered({ [text]: 'Done' }))).toEqual({
      action: 'accept'
    })
    expect(claudeElicitationResult(url, questions, answered({ [text]: 'Decline' }))).toEqual({
      action: 'decline'
    })
  })
})
