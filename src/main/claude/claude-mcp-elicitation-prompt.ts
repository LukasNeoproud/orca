import type {
  ElicitationRequest,
  ElicitationResult,
  OnElicitation,
  PermissionResult
} from '@anthropic-ai/claude-agent-sdk'
import type { ClaudePermissionCallbackDeps } from './claude-structured-inbound-control'
import { claudeRecord, claudeText } from './claude-structured-item-translation'

// An MCP server's request for user input, shown as the question card AskUserQuestion uses: each
// field of its form is one question, and a sign-in link is one question with the link in it.

const SKIP = 'Skip'
const YES = 'Yes'
const NO = 'No'
const DONE = 'Done'
const DECLINE = 'Decline'

type ElicitationField = {
  name: string
  question: string
  type: 'string' | 'number' | 'boolean' | 'choice' | 'choices'
  /** A choice's label to the value the server asked for. */
  choices: Map<string, string>
  required: boolean
}

function choiceEntries(schema: Record<string, unknown>): [string, string][] {
  const titled = Array.isArray(schema.oneOf) ? schema.oneOf : schema.anyOf
  if (Array.isArray(titled)) {
    return titled.flatMap((value): [string, string][] => {
      const option = claudeRecord(value)
      const constant = claudeText(option?.const)
      return constant ? [[claudeText(option?.title) ?? constant, constant]] : []
    })
  }
  const values = Array.isArray(schema.enum) ? schema.enum : []
  const names = Array.isArray(schema.enumNames) ? schema.enumNames : []
  return values.flatMap((value, index): [string, string][] =>
    typeof value === 'string' ? [[claudeText(names[index]) ?? value, value]] : []
  )
}

function elicitationFields(request: ElicitationRequest): ElicitationField[] {
  const properties = claudeRecord(request.requestedSchema?.properties) ?? {}
  const required = Array.isArray(request.requestedSchema?.required)
    ? request.requestedSchema.required
    : []
  return Object.entries(properties).flatMap(([name, value]): ElicitationField[] => {
    const schema = claudeRecord(value)
    if (!schema) {
      return []
    }
    const items = claudeRecord(schema.items)
    const choices = new Map(choiceEntries(schema.type === 'array' && items ? items : schema))
    const type =
      schema.type === 'array'
        ? 'choices'
        : choices.size > 0
          ? 'choice'
          : schema.type === 'boolean'
            ? 'boolean'
            : schema.type === 'number' || schema.type === 'integer'
              ? 'number'
              : 'string'
    const title = claudeText(schema.title) ?? name
    const description = claudeText(schema.description)
    return [
      {
        name,
        question: description ? `${title} — ${description}` : title,
        type,
        choices,
        required: required.includes(name)
      }
    ]
  })
}

function questionOf(field: ElicitationField, lead: string | null): Record<string, unknown> {
  const labels =
    field.type === 'boolean'
      ? [YES, NO]
      : [...field.choices.keys(), ...(field.required || field.type === 'choices' ? [] : [SKIP])]
  const skippable = !field.required && field.type !== 'choice' && field.type !== 'boolean'
  return {
    question: lead ? `${lead}\n\n${field.question}` : field.question,
    header: field.name,
    multiSelect: field.type === 'choices',
    options: [
      ...labels.map((label) => ({ label })),
      ...(skippable && !labels.includes(SKIP) ? [{ label: SKIP }] : [])
    ]
  }
}

/** The AskUserQuestion input that asks this elicitation. */
export function claudeElicitationQuestions(request: ElicitationRequest): Record<string, unknown>[] {
  const lead = `${request.serverName}: ${request.message}`
  if (request.mode === 'url') {
    return [
      {
        question: request.url ? `${lead}\n\n${request.url}` : lead,
        header: request.serverName,
        multiSelect: false,
        options: [{ label: DONE }, { label: DECLINE }]
      }
    ]
  }
  const fields = elicitationFields(request)
  if (fields.length === 0) {
    return [
      {
        question: lead,
        header: request.serverName,
        multiSelect: false,
        options: [{ label: DONE }, { label: DECLINE }]
      }
    ]
  }
  return fields.map((field, index) => questionOf(field, index === 0 ? lead : null))
}

function fieldValue(field: ElicitationField, answer: unknown): unknown {
  if (field.type === 'choices') {
    const labels = Array.isArray(answer) ? answer : [answer]
    return labels.flatMap((label) =>
      typeof label === 'string' ? [field.choices.get(label) ?? label] : []
    )
  }
  const text = Array.isArray(answer) ? answer[0] : answer
  if (typeof text !== 'string' || (text === SKIP && !field.required)) {
    return undefined
  }
  if (field.type === 'boolean') {
    return text === YES
  }
  if (field.type === 'number') {
    const value = Number(text)
    return Number.isFinite(value) ? value : undefined
  }
  return field.choices.get(text) ?? text
}

/** The server's answer from how the question card settled. */
export function claudeElicitationResult(
  request: ElicitationRequest,
  questions: readonly Record<string, unknown>[],
  settled: PermissionResult | null
): ElicitationResult {
  if (!settled || settled.behavior !== 'allow') {
    return { action: settled ? 'decline' : 'cancel' }
  }
  const answers = claudeRecord(settled.updatedInput?.answers) ?? {}
  const answerAt = (index: number): unknown => answers[String(questions[index]?.question)]
  const fields = request.mode === 'url' ? [] : elicitationFields(request)
  if (fields.length === 0) {
    return { action: answerAt(0) === DECLINE ? 'decline' : 'accept' }
  }
  const content: Record<string, string | number | boolean | string[]> = {}
  fields.forEach((field, index) => {
    const value = fieldValue(field, answerAt(index))
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      Array.isArray(value)
    ) {
      content[field.name] = value
    }
  })
  return { action: 'accept', content }
}

/** Registers the elicitation as a pending question; an aborted one is forgotten, never answered. */
export function buildClaudeElicitationCallback(deps: ClaudePermissionCallbackDeps): OnElicitation {
  return (request, options) =>
    new Promise<ElicitationResult>((resolve) => {
      const questions = claudeElicitationQuestions(request)
      let cancel = (): void => {}
      const settle = (response: PermissionResult | null): void => {
        options.signal.removeEventListener('abort', cancel)
        resolve(claudeElicitationResult(request, questions, response))
      }
      const prompt = deps.prompts.register({
        requestId: options.requestId,
        toolName: 'AskUserQuestion',
        toolUseId: `mcp-elicitation:${options.requestId}`,
        input: { questions },
        suggestions: [],
        settle
      })
      if (!prompt) {
        resolve({ action: 'cancel' })
        return
      }
      cancel = (): void => {
        if (deps.prompts.forgetIfPending(prompt)) {
          deps.emit({
            type: 'prompt-cancelled',
            sessionId: deps.sessionId,
            promptKey: prompt.promptKey
          })
          settle(null)
        }
      }
      if (options.signal.aborted) {
        cancel()
        return
      }
      options.signal.addEventListener('abort', cancel, { once: true })
      deps.emit({ type: 'prompt', sessionId: deps.sessionId, prompt })
    })
}
