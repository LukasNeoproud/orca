import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type CodexInteractionSocketEndpoint = {
  path: string
  close: () => Promise<void>
}

/** Creates one private endpoint on the same execution host as the Codex child. */
export async function createCodexInteractionSocketEndpoint(
  onSocket: (socket: Socket) => void,
  onError: () => void
): Promise<CodexInteractionSocketEndpoint> {
  const directory = process.platform === 'win32' ? null : await mkdtemp(join(tmpdir(), 'orca-i-'))
  if (directory) {
    await chmod(directory, 0o700)
  }
  const path =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\orca-interaction-${randomUUID()}`
      : join(directory as string, 'socket')
  const server = createServer(onSocket)
  try {
    await new Promise<void>((resolve, reject) => {
      const rejectReady = (error: Error): void => reject(error)
      server.once('error', rejectReady)
      server.listen(path, () => {
        server.off('error', rejectReady)
        resolve()
      })
    })
    server.on('error', onError)
    if (directory) {
      await chmod(path, 0o600)
    }
  } catch (error) {
    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve()
        return
      }
      server.close(() => resolve())
    })
    if (directory) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
    throw error
  }

  let closePromise: Promise<void> | null = null
  return {
    path,
    close: () => {
      if (closePromise) {
        return closePromise
      }
      closePromise = (async () => {
        await new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve()
            return
          }
          server.close(() => resolve())
        })
        if (directory) {
          await rm(directory, { recursive: true, force: true })
        }
      })()
      return closePromise
    }
  }
}
