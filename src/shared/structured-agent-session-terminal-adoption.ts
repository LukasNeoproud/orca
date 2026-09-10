import type { AgentSessionMutationEnvelope } from './agent-session-wire'
import type { AgentSessionRecord } from './agent-session-record'
import { parsePaneKey } from './stable-pane-id'

export type StructuredAgentSessionTerminalAdoptionParams = {
  envelope: AgentSessionMutationEnvelope
  worktree: string
  terminal: { tabId: string; paneKey: string; ptyId: string }
  agent: 'claude' | 'codex'
  providerSessionId: string
}

export type StructuredAgentSessionTerminalAdoptionResult = {
  sessionId: string
  fence: number
  agent: 'claude' | 'codex'
}

/** The original shell survives the transfer; its incarnation fences later recovery. */
export type AgentSessionAdoptedTerminal =
  StructuredAgentSessionTerminalAdoptionParams['terminal'] & { incarnationId: string }

export function isOriginalAdoptedTerminalOwner(record: AgentSessionRecord): boolean {
  const root = record.providerHandleChain[0]
  return Boolean(
    record.adoptedTerminal &&
    record.lease.runtimeKind === 'tui' &&
    root?.origin === 'adopted' &&
    record.lease.runtimeFence === root.mintedAtFence
  )
}

export function isAgentSessionAdoptedTerminal(
  value: unknown
): value is AgentSessionAdoptedTerminal {
  if (!value || typeof value !== 'object') {
    return false
  }
  const terminal = value as Partial<AgentSessionAdoptedTerminal>
  return (
    typeof terminal.tabId === 'string' &&
    terminal.tabId.length > 0 &&
    typeof terminal.paneKey === 'string' &&
    parsePaneKey(terminal.paneKey)?.tabId === terminal.tabId &&
    typeof terminal.ptyId === 'string' &&
    terminal.ptyId.length > 0 &&
    terminal.ptyId.length <= 4096 &&
    typeof terminal.incarnationId === 'string' &&
    terminal.incarnationId.length > 0 &&
    terminal.incarnationId.length <= 512
  )
}
