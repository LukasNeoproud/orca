import { StringDecoder } from 'node:string_decoder'
import type { BacklogTask } from '../../shared/backlog-types'

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024

export class BacklogJsonStream {
  private readonly decoder = new StringDecoder('utf8')
  private document = ''
  private byteCount = 0
  private depth = 0
  private quoted = false
  private escaped = false

  push(chunk: Buffer | string): unknown[] {
    const value = typeof chunk === 'string' ? chunk : this.decoder.write(chunk)
    const documents: unknown[] = []
    for (const char of value) {
      if (this.depth === 0 && /\s/.test(char)) {
        continue
      }
      if (this.depth === 0 && char !== '{') {
        throw new Error('Backlog emitted invalid JSON')
      }
      this.document += char
      this.byteCount += Buffer.byteLength(char)
      if (this.byteCount > MAX_DOCUMENT_BYTES) {
        throw new Error('Backlog JSON output exceeded 2 MB')
      }
      if (this.quoted) {
        if (this.escaped) {
          this.escaped = false
        } else if (char === '\\') {
          this.escaped = true
        } else if (char === '"') {
          this.quoted = false
        }
      } else if (char === '"') {
        this.quoted = true
      } else if (char === '{' || char === '[') {
        this.depth++
      } else if (char === '}' || char === ']') {
        this.depth--
      }
      if (this.depth < 0) {
        throw new Error('Backlog emitted invalid JSON')
      }
      if (this.depth === 0) {
        try {
          documents.push(JSON.parse(this.document))
        } catch {
          throw new Error('Backlog emitted invalid JSON')
        }
        this.document = ''
        this.byteCount = 0
      }
    }
    return documents
  }

  finish(): void {
    const trailing = this.decoder.end()
    if (trailing) {
      this.push(trailing)
    }
    if (this.document) {
      throw new Error('Backlog JSON output ended mid-document')
    }
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseTask(value: unknown): BacklogTask {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.status !== 'string' ||
    !(typeof value.priority === 'string' || value.priority === null)
  ) {
    throw new Error('Backlog returned an unsupported task schema')
  }
  const task: BacklogTask = {
    id: value.id,
    title: value.title,
    status: value.status,
    priority: value.priority
  }
  if (
    typeof value.ordinal === 'number' &&
    Number.isSafeInteger(value.ordinal) &&
    value.ordinal >= 0
  ) {
    task.ordinal = value.ordinal
  }
  if (value.description !== undefined && value.description !== null) {
    if (typeof value.description !== 'string') {
      throw new Error('Backlog returned an unsupported task schema')
    }
    task.description = value.description
  }
  if (value.acceptanceCriteria !== undefined) {
    if (!Array.isArray(value.acceptanceCriteria)) {
      throw new Error('Backlog returned an unsupported task schema')
    }
    task.acceptanceCriteria = value.acceptanceCriteria.map((criterion: unknown) => {
      if (
        !object(criterion) ||
        !Number.isInteger(criterion.index) ||
        typeof criterion.text !== 'string' ||
        typeof criterion.checked !== 'boolean'
      ) {
        throw new Error('Backlog returned an unsupported task schema')
      }
      return { index: criterion.index as number, text: criterion.text, checked: criterion.checked }
    })
  }
  return task
}

export function parseTaskList(value: unknown): BacklogTask[] {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'task-list' ||
    !Array.isArray(value.tasks)
  ) {
    throw new Error('Backlog returned an unsupported task-list schema')
  }
  return value.tasks.map(parseTask)
}

export function parseTaskView(value: unknown): BacklogTask {
  if (!object(value) || value.schemaVersion !== 1 || value.kind !== 'task-view') {
    throw new Error('Backlog returned an unsupported task-view schema')
  }
  return parseTask(value.task)
}
