import { randomUUID } from 'node:crypto'
import {
  AgentContextTransitionInputSchema,
  type AgentContextTransitionInput
} from '../shared/agent-context-transition'
import { RuntimeClientError } from './runtime-client'

const MAX_REQUEST_ID_LENGTH = 256

export type AgentContextCaller = {
  sessionId?: string
  spawnToken?: string
  terminalHandle?: string
  paneKey?: string
}

export function agentContextCallerFromEnvironment(
  env: NodeJS.ProcessEnv = process.env
): AgentContextCaller {
  const sessionId = nonEmptyEnv(env.ORCA_AGENT_SESSION_ID)
  const spawnToken = nonEmptyEnv(env.ORCA_AGENT_SESSION_SPAWN_TOKEN)
  if ((sessionId === undefined) !== (spawnToken === undefined)) {
    throw new RuntimeClientError(
      'invalid_environment',
      'This context-management tool needs both ORCA_AGENT_SESSION_ID and ORCA_AGENT_SESSION_SPAWN_TOKEN.'
    )
  }
  // Structured session proof wins because workers may also expose a terminal handle.
  if (sessionId !== undefined && spawnToken !== undefined) {
    return { sessionId, spawnToken }
  }
  const terminalHandle = nonEmptyEnv(env.ORCA_TERMINAL_HANDLE)
  const paneKey = nonEmptyEnv(env.ORCA_PANE_KEY)
  if ((terminalHandle === undefined) !== (paneKey === undefined)) {
    throw new RuntimeClientError(
      'invalid_environment',
      'This context-management tool needs both ORCA_TERMINAL_HANDLE and ORCA_PANE_KEY.'
    )
  }
  if (sessionId === undefined && terminalHandle === undefined) {
    throw new RuntimeClientError(
      'invalid_environment',
      'This context-management tool must run inside an Orca-owned Codex session.'
    )
  }
  return { terminalHandle, paneKey }
}

export function agentContextRequestId(value: string | undefined): string {
  if (value === undefined) {
    return randomUUID()
  }
  if (!validIdentifier(value, MAX_REQUEST_ID_LENGTH)) {
    throw new RuntimeClientError('invalid_argument', 'Invalid context transition request ID.')
  }
  return value
}

export function agentContextTransitionInput(input: unknown): AgentContextTransitionInput {
  const parsed = AgentContextTransitionInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid context transition input. Supply a complete structured checkpoint, reason, and continuation.'
    )
  }
  return parsed.data
}

function nonEmptyEnv(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function validIdentifier(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && value === value.trim()
}
