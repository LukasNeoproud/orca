import { randomUUID } from 'node:crypto'
import type { BacklogBoard } from '../../shared/backlog-types'
import type { BacklogChild } from './backlog-service'

const MAX_BOARD_STARTUP = 32_768

export function waitForBoard(
  child: BacklogChild,
  port: number,
  timeoutMs: number
): Promise<BacklogBoard> {
  return new Promise((resolve, reject) => {
    let output = ''
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve({ url: `http://127.0.0.1:${port}`, port, instanceId: randomUUID() })
      }
    }
    const timer = setTimeout(
      () => finish(new Error('Backlog board did not report startup in time.')),
      timeoutMs
    )
    const onData = (chunk: Buffer | string): void => {
      output = (output + chunk.toString()).slice(-MAX_BOARD_STARTUP)
      const line = output
        .split(/\r?\n/)
        .find(
          (entry) =>
            /\b(?:ready|running|listening|started)\b/i.test(entry) &&
            new RegExp(String.raw`https?://(?:127\.0\.0\.1|localhost):${port}(?:\b|/)`, 'i').test(
              entry
            )
        )
      if (line) {
        finish()
      }
    }
    child.onStdout(onData)
    child.onStderr(onData)
    child.onError((error) => finish(error))
    child.onExit((code) =>
      finish(new Error(output || `Backlog board exited with code ${code ?? 'unknown'}.`))
    )
  })
}
