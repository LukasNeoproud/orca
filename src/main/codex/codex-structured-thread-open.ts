// Starting or resuming the single Codex thread a structured session owns.
//
// The reply is verified before the caller registers the session, because a
// resume that lands on a different thread is a fork wearing a resume's name —
// recording it would make the durable handle chain lie about what this session
// actually proved.

import {
  isCodexAppServerRequestError,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import { readCodexThreadId, readCodexThreadPath } from './codex-structured-thread-facts'
import {
  readCodexCustomPermissionsDescription,
  readCodexPermissionsMode
} from './codex-structured-permissions'
import {
  ORCA_INTERACTIVE_UI_INSTRUCTIONS,
  ORCA_INTERACT_DYNAMIC_TOOLS
} from './codex-orca-interaction'

export type CodexOpenedThread = {
  threadId: string
  thread?: Record<string, unknown>
  /** Metadata-only resume needs a bounded canonical history read before publication. */
  historyRequiresRead?: true
  /** Rollout file Codex named, when it named one. */
  historyPath: string | null
  historyMode?: 'legacy' | 'paginated'
  model?: string
  effort?: string
  serviceTier?: string | null
  permissions?: string
  permissionsCustomDescription?: string
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

const resumeMetadataUnsupported = new WeakSet<object>()
const interactiveThreadStartUnsupported = new WeakSet<object>()

function isExcludeTurnsUnsupported(error: unknown): boolean {
  return (
    isCodexAppServerRequestError(error) &&
    error.code === -32602 &&
    /(?:unknown|unexpected|unsupported|unrecognized).{0,80}excludeTurns|excludeTurns.{0,80}(?:unknown|unexpected|unsupported|unrecognized)/i.test(
      error.message
    )
  )
}

function isInteractiveThreadStartUnsupported(error: unknown): boolean {
  return (
    isCodexAppServerRequestError(error) &&
    error.code === -32602 &&
    /(?:unknown|unexpected|unsupported|unrecognized).{0,80}(?:dynamic[_ ]?tools|developer[_ ]?instructions)|(?:dynamic[_ ]?tools|developer[_ ]?instructions).{0,80}(?:unknown|unexpected|unsupported|unrecognized)/i.test(
      error.message
    )
  )
}

function configuredDeveloperInstructions(value: unknown): string | null | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const config = (value as Record<string, unknown>).config
  if (typeof config !== 'object' || config === null) {
    return undefined
  }
  const instructions = (config as Record<string, unknown>).developer_instructions
  return instructions === null || typeof instructions === 'string' ? instructions : undefined
}

async function additiveInteractiveInstructions(
  connection: Pick<CodexAppServerConnection, 'request'>,
  cwd: string,
  timeoutMs: number | undefined
): Promise<string | undefined> {
  try {
    const configured = configuredDeveloperInstructions(
      await connection.request('config/read', { cwd }, { timeoutMs })
    )
    if (configured === undefined) {
      return undefined
    }
    return configured
      ? `${configured}\n\n${ORCA_INTERACTIVE_UI_INSTRUCTIONS}`
      : ORCA_INTERACTIVE_UI_INSTRUCTIONS
  } catch {
    // An unreadable or older config API must not make Orca replace instructions it cannot preserve.
    return undefined
  }
}

async function startCodexThread(
  connection: Pick<CodexAppServerConnection, 'request'>,
  cwd: string,
  timeoutMs: number | undefined
): Promise<unknown> {
  if (interactiveThreadStartUnsupported.has(connection)) {
    return connection.request('thread/start', { cwd }, { timeoutMs })
  }
  const developerInstructions = await additiveInteractiveInstructions(connection, cwd, timeoutMs)
  try {
    return await connection.request(
      'thread/start',
      {
        cwd,
        ...(developerInstructions ? { developerInstructions } : {}),
        dynamicTools: ORCA_INTERACT_DYNAMIC_TOOLS
      },
      { timeoutMs }
    )
  } catch (error) {
    if (!isInteractiveThreadStartUnsupported(error)) {
      throw error
    }
    interactiveThreadStartUnsupported.add(connection)
    return connection.request('thread/start', { cwd }, { timeoutMs })
  }
}

async function resumeCodexThread(
  connection: Pick<CodexAppServerConnection, 'request'>,
  params: Record<string, unknown>,
  timeoutMs: number | undefined
): Promise<{ opened: unknown; historyRequiresRead: boolean }> {
  if (resumeMetadataUnsupported.has(connection)) {
    return {
      opened: await connection.request('thread/resume', params, { timeoutMs }),
      historyRequiresRead: false
    }
  }
  try {
    return {
      opened: await connection.request(
        'thread/resume',
        { ...params, excludeTurns: true },
        { timeoutMs }
      ),
      historyRequiresRead: true
    }
  } catch (error) {
    if (!isExcludeTurnsUnsupported(error)) {
      throw error
    }
    resumeMetadataUnsupported.add(connection)
    return {
      opened: await connection.request('thread/resume', params, { timeoutMs }),
      historyRequiresRead: false
    }
  }
}

export async function openCodexThread(
  connection: Pick<CodexAppServerConnection, 'request'>,
  launch: { cwd: string; resumeThreadId: string | null; resumePath?: string | null },
  timeoutMs: number | undefined
): Promise<CodexOpenedThread> {
  const resumeParams = launch.resumeThreadId
    ? {
        threadId: launch.resumeThreadId,
        cwd: launch.cwd,
        ...(launch.resumePath ? { path: launch.resumePath } : {})
      }
    : null
  const resumed = resumeParams ? await resumeCodexThread(connection, resumeParams, timeoutMs) : null
  const opened = resumed
    ? resumed.opened
    : await startCodexThread(connection, launch.cwd, timeoutMs)
  const threadId = readCodexThreadId(opened)
  if (!threadId) {
    throw new Error('codex app-server did not name the thread it opened')
  }
  if (launch.resumeThreadId && threadId !== launch.resumeThreadId) {
    throw new Error(`codex app-server resumed ${threadId} instead of ${launch.resumeThreadId}`)
  }
  const result = opened as Record<string, unknown>
  const thread =
    typeof result.thread === 'object' && result.thread !== null
      ? (result.thread as Record<string, unknown>)
      : {}
  const model = nonEmptyString(result.model)
  const effort = nonEmptyString(result.reasoningEffort)
  const permissions = readCodexPermissionsMode(result, launch.cwd)
  const permissionsCustomDescription = readCodexCustomPermissionsDescription(result, launch.cwd)
  return {
    threadId,
    thread,
    ...(resumed?.historyRequiresRead ? { historyRequiresRead: true as const } : {}),
    historyPath: readCodexThreadPath(opened),
    ...(thread.historyMode === 'legacy' || thread.historyMode === 'paginated'
      ? { historyMode: thread.historyMode }
      : {}),
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
    ...(result.serviceTier === null || typeof result.serviceTier === 'string'
      ? { serviceTier: result.serviceTier }
      : {}),
    ...(permissions ? { permissions } : {}),
    ...(permissionsCustomDescription ? { permissionsCustomDescription } : {})
  }
}
