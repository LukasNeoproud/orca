import { StringDecoder } from 'node:string_decoder'
import type { BacklogTarget } from './backlog-service'
import { BacklogJsonStream } from './backlog-json'
import { backlogErrorMessage } from './backlog-diagnostic'

export const MAX_DIAGNOSTIC = 8_192
const MAX_CONFIG_OUTPUT = 8_192

export function appendLimited(current: string, chunk: Buffer | string, limit: number): string {
  return (current + chunk.toString()).slice(-limit)
}

export async function runJson(
  target: BacklogTarget,
  args: string[],
  timeoutMs: number
): Promise<unknown> {
  const child = await target.spawn(args)
  return new Promise((resolve, reject) => {
    const stream = new BacklogJsonStream()
    const docs: unknown[] = []
    let stderr = ''
    let settled = false
    const finish = (error?: unknown): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(new Error(backlogErrorMessage(error)))
      } else if (docs.length !== 1) {
        reject(new Error('Backlog returned an unexpected JSON response'))
      } else {
        resolve(docs[0])
      }
    }
    const timeout = setTimeout(() => {
      finish(new Error('Backlog command timed out.'))
      void child.stop().catch(() => undefined)
    }, timeoutMs)
    child.onStdout((chunk) => {
      if (settled) {
        return
      }
      try {
        docs.push(...stream.push(chunk))
        if (docs.length > 1) {
          throw new Error('Backlog returned more than one JSON response')
        }
      } catch (error) {
        finish(error)
        void child.stop().catch(() => undefined)
      }
    })
    child.onStderr((chunk) => {
      stderr = appendLimited(stderr, chunk, MAX_DIAGNOSTIC)
    })
    child.onError((error) => finish(error))
    child.onExit((code) => {
      if (settled) {
        return
      }
      if (code !== 0) {
        finish(new Error(stderr || `Backlog exited with code ${code ?? 'unknown'}.`))
        return
      }
      try {
        stream.finish()
        finish()
      } catch (error) {
        finish(error)
      }
    })
  })
}

export async function readBacklogPriorities(
  target: BacklogTarget,
  timeoutMs: number,
  signal: AbortSignal
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8')
    let output = ''
    let settled = false
    let child: Awaited<ReturnType<BacklogTarget['spawn']>> | undefined
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (error) {
        reject(error)
        return
      }
      const priorities = output
        .trim()
        .split(',')
        .map((priority) => priority.trim())
      if (priorities.some((priority) => !priority)) {
        reject(new Error('Backlog returned invalid priorities'))
      } else {
        resolve(priorities)
      }
    }
    const abort = (): void => {
      finish(new Error('Backlog priority read cancelled'))
      void child?.stop().catch(() => undefined)
    }
    const timeout = setTimeout(() => {
      finish(new Error('Backlog priority read timed out'))
      void child?.stop().catch(() => undefined)
    }, timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    void target.spawn(['config', 'get', 'priorities']).then(
      (spawned) => {
        child = spawned
        if (settled) {
          void child.stop().catch(() => undefined)
          return
        }
        child.onStdout((chunk) => {
          if (settled) {
            return
          }
          output += typeof chunk === 'string' ? chunk : decoder.write(chunk)
          if (Buffer.byteLength(output) > MAX_CONFIG_OUTPUT) {
            finish(new Error('Backlog priority output exceeded 8 KB'))
            void child?.stop().catch(() => undefined)
          }
        })
        child.onError((error) => finish(error))
        child.onExit((code) => {
          output += decoder.end()
          finish(
            code === 0 ? undefined : new Error(`Backlog priority read exited with code ${code}`)
          )
        })
      },
      (error: unknown) => finish(new Error(backlogErrorMessage(error)))
    )
  })
}
