// Must stay electron-free: it runs as a worker thread.
import { parentPort, workerData } from 'node:worker_threads'
import type { ClaudeConversationForkJob } from './claude-conversation-fork-worker'

if (!parentPort) {
  throw new Error('Claude conversation fork must run on a worker thread')
}
const port = parentPort
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: forkClaudeConversationInWorker is the only spawner and passes a ClaudeConversationForkJob.
const job = workerData as ClaudeConversationForkJob

// Why a worker: the SDK reads CLAUDE_CONFIG_DIR from its own process env, once; the worker's env
// is pinned to the account that holds the parent transcript.
void import('@anthropic-ai/claude-agent-sdk')
  .then(({ forkSession }) =>
    forkSession(job.sourceSessionId, { upToMessageId: job.upToUuid, title: job.title })
  )
  .then(
    ({ sessionId }) => port.postMessage({ ok: true, sessionId }),
    (error: unknown) =>
      port.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  )
  .finally(() => port.close())
