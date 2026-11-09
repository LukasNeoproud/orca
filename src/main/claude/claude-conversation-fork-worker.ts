import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { currentWorkerEntryLayout, resolveWorkerThreadEntryPath } from '../worker-thread-entry-path'
import { claudeConfigDirEnvPatch, withoutInheritedClaudeConfigDir } from './claude-config-dir-pin'

export type ClaudeConversationForkJob = {
  sourceSessionId: string
  upToUuid: string
  title: string
}

const WORKER_FILENAME = 'claude-conversation-fork-worker-entry.js'

function workerPath(): string {
  const entry = resolveWorkerThreadEntryPath(currentWorkerEntryLayout(__dirname), WORKER_FILENAME)
  // Rollup can place this launcher in a shared chunk beside the worker entries.
  return [entry, join(dirname(entry), '..', WORKER_FILENAME)].find(existsSync) ?? entry
}

/** Copies the parent transcript up to `upToUuid` into a new Claude session under the same account
 *  home; resolves to the new session id. The parent is never written. */
export function forkClaudeConversationInWorker(
  job: ClaudeConversationForkJob,
  accountHomePath: string,
  path = workerPath(),
  timeoutMs = 60_000
): Promise<string> {
  const base = withoutInheritedClaudeConfigDir(process.env)
  const env = { ...base, ...claudeConfigDirEnvPatch(accountHomePath, { env: base }) }
  return new Promise((resolve, reject) => {
    const worker = new Worker(path, { workerData: job, env })
    const timer = setTimeout(() => {
      reject(new Error('conversation_branch_fork_unverified: the fork timed out'))
      void worker.terminate()
    }, timeoutMs)
    let result: { ok: true; sessionId: string } | { ok: false; error: string } | null = null
    worker.once('message', (message) => {
      result = message
    })
    worker.once('error', reject)
    worker.once('exit', (code) => {
      clearTimeout(timer)
      if (result?.ok) {
        resolve(result.sessionId)
      } else {
        reject(new Error(result?.error ?? `Claude conversation fork worker exited (${code})`))
      }
    })
  })
}
