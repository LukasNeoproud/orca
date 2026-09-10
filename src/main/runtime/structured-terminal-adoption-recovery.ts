import type {
  AgentSessionRecord,
  AgentSessionProcessIdentity
} from '../../shared/agent-session-record'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { StructuredTuiOwner } from '../native-chat/agent-session-wire/structured-agent-session-handoff-types'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import type { RuntimePtyController } from './runtime-pty-controller-contract'
import { PROCESS_START_TIME_TOLERANCE_MS } from './agent-session-process-identity-probe'
import { readStructuredTuiProcessIdentity } from './structured-tui-process-identity'
import {
  assertStructuredTerminalWorkingDirectory,
  selectStructuredTerminalProviderSession,
  resolveStructuredTerminalTranscript
} from './structured-terminal-provider-proof'
import { claudeProviderHandleLink } from '../claude/claude-structured-owner-identity'
import { agentSessionPtyWriteGate } from './agent-session-pty-write-gate'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import type { StructuredAgentSessionTerminalAdoptionResult } from '../../shared/structured-agent-session-terminal-adoption'
import { isOriginalAdoptedTerminalOwner } from '../../shared/structured-agent-session-terminal-adoption'
import { StructuredTerminalAdoptionError } from '../native-chat/agent-session-wire/structured-agent-session-terminal-adoption'

export async function replayStructuredTerminalAdoption(input: {
  host: StructuredAgentSessionHost
  prior: AgentSessionRecord
  identity: AgentSessionProcessIdentity
  revalidate: () => Promise<void>
  ptyId: string
}): Promise<StructuredAgentSessionTerminalAdoptionResult> {
  const assertOriginalWriter = () => {
    const record = input.host.deps.store.getRecord(input.prior.sessionId)!
    const recorded = record.lease.ownerProcess
    if (
      !isOriginalAdoptedTerminalOwner(record) ||
      record.lease.claimStatus !== 'live' ||
      record.lease.handoffStage !== null ||
      recorded?.pid !== input.identity.pid ||
      recorded.processStartTimeMs === null ||
      input.identity.processStartTimeMs === null ||
      Math.abs(recorded.processStartTimeMs - input.identity.processStartTimeMs) >
        PROCESS_START_TIME_TOLERANCE_MS
    ) {
      throw new StructuredTerminalAdoptionError(
        'agent_session_conflict',
        'This pane now runs a different agent owner. Its previous structured conversation cannot take over this terminal.'
      )
    }
    return record
  }
  assertOriginalWriter()
  await input.host.revealSession(input.prior.sessionId)
  await input.revalidate()
  const record = assertOriginalWriter()
  const bound = agentSessionPtyWriteGate.boundSessionId(input.ptyId)
  if (bound && bound !== record.sessionId) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'The terminal changed ownership.'
    )
  }
  agentSessionPtyWriteGate.bindPty(input.ptyId, record.sessionId)
  return { sessionId: record.sessionId, fence: record.lease.runtimeFence, agent: record.provider }
}

export async function recoverStructuredTerminalAdoption(input: {
  record: AgentSessionRecord
  workspacePath: string
  readPty: () => RuntimePtyWorktreeRecord | undefined
  listProcesses: NonNullable<RuntimePtyController['listProcesses']>
  providerRows: () => readonly AgentStatusIpcPayload[]
  issueHandle: (pty: RuntimePtyWorktreeRecord) => string
}): Promise<StructuredTuiOwner> {
  const { record } = input
  const terminal = record.adoptedTerminal
  const identity = record.lease.ownerProcess
  const head = record.providerHandleChain.at(-1)
  if (
    !terminal ||
    !identity ||
    !head ||
    identity.processStartTimeMs === null ||
    !isOriginalAdoptedTerminalOwner(record)
  ) {
    throw new Error('agent_session_identity_required')
  }
  const readPty = () => {
    const pty = input.readPty()
    if (
      !pty?.connected ||
      pty.connectionId !== null ||
      pty.isWsl ||
      pty.wslDistro ||
      pty.worktreeId !== record.location.workspaceId ||
      pty.incarnationId !== terminal.incarnationId ||
      pty.tabId !== terminal.tabId ||
      pty.paneKey !== terminal.paneKey
    ) {
      throw new Error('The adopted terminal no longer owns its original pane.')
    }
    return pty
  }
  readPty()
  const listed = (await input.listProcesses(null)).find(
    (entry) => entry.id === terminal.ptyId && entry.incarnationId === terminal.incarnationId
  )
  if (!listed?.rootProcessId) {
    throw new Error('The adopted terminal process could not be recovered.')
  }
  const observed = await readStructuredTuiProcessIdentity({
    hostId: 'local',
    rootPid: listed.rootProcessId,
    spawnToken: identity.spawnToken,
    agent: record.provider,
    unwrapCodexLauncher: true
  })
  if (
    observed.pid !== identity.pid ||
    observed.processStartTimeMs === null ||
    Math.abs(observed.processStartTimeMs - identity.processStartTimeMs) >
      PROCESS_START_TIME_TOLERANCE_MS
  ) {
    throw new Error('The adopted terminal now runs a different agent process.')
  }
  await assertStructuredTerminalWorkingDirectory(identity.pid, input.workspacePath)
  const providerSession = selectStructuredTerminalProviderSession({
    paneKey: terminal.paneKey,
    incarnationId: terminal.incarnationId,
    agent: record.provider,
    providerSessionId:
      head.handle.provider === 'codex' ? head.handle.threadId : head.handle.sessionId,
    launchToken: readPty().launchToken,
    processStartTimeMs: identity.processStartTimeMs,
    rows: input.providerRows()
  })
  const transcript = await resolveStructuredTerminalTranscript({
    agent: record.provider,
    providerSession,
    candidateAccountHomes: [record.accountHome.path]
  })
  const pty = readPty()
  agentSessionPtyWriteGate.bindPty(pty.ptyId, record.sessionId)
  return {
    terminal: { ...terminal, handle: input.issueHandle(pty) },
    process: identity,
    link:
      head.handle.provider === 'claude'
        ? claudeProviderHandleLink({
            sessionId: head.handle.sessionId,
            leafUuid: transcript.leafUuid,
            resumed: true,
            fence: record.lease.runtimeFence,
            observedAt: Date.now()
          })
        : head,
    transcriptPath: transcript.transcriptPath,
    adoptedTerminal: true,
    ...(record.provider === 'codex' ? { historySource: 'provider-resume' as const } : {})
  }
}
