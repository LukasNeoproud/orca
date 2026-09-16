import type { BacklogTarget } from './backlog-service'
import { BacklogJsonStream } from './backlog-json'
import { backlogErrorMessage } from './backlog-diagnostic'

export const MAX_DIAGNOSTIC = 8_192

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
