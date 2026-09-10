import { randomUUID } from 'node:crypto'
import type {
  AgentSessionExecutionLocation,
  AgentSessionRecord
} from '../../shared/agent-session-record'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type {
  StructuredAgentSessionTerminalAdoptionParams,
  StructuredAgentSessionTerminalAdoptionResult
} from '../../shared/structured-agent-session-terminal-adoption'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import type { RuntimePtyController } from './runtime-pty-controller-contract'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import type { StructuredTuiOwner } from '../native-chat/agent-session-wire/structured-agent-session-handoff-types'
import { StructuredTerminalAdoptionError } from '../native-chat/agent-session-wire/structured-agent-session-terminal-adoption'
import { codexProviderHandleLink } from '../codex/codex-structured-owner-identity'
import { claudeProviderHandleLink } from '../claude/claude-structured-owner-identity'
import { readStructuredTuiProcessIdentity } from './structured-tui-process-identity'
import { probeAgentSessionProcessIdentity } from './agent-session-process-identity-probe'
import { readEchoedAgentSessionSpawnToken } from './agent-session-spawn-token-readback'
import { agentSessionPtyWriteGate } from './agent-session-pty-write-gate'
import {
  assertStructuredTerminalWorkingDirectory,
  resolveStructuredTerminalTranscript,
  selectStructuredTerminalProviderSession
} from './structured-terminal-provider-proof'
import { structuredTerminalLaunchArgs } from './structured-terminal-launch-args'
import { replayStructuredTerminalAdoption } from './structured-terminal-adoption-recovery'

export type StructuredTerminalAdoptionContext = {
  runtime: object
  host: StructuredAgentSessionHost
  location: AgentSessionExecutionLocation
  workspacePath: string
  readPty: () => RuntimePtyWorktreeRecord
  issueHandle: (pty: RuntimePtyWorktreeRecord) => string
  listProcesses: NonNullable<RuntimePtyController['listProcesses']>
  providerRows: () => readonly AgentStatusIpcPayload[]
  accountHomes: (pty: RuntimePtyWorktreeRecord) => readonly string[]
}

const inFlight = new WeakMap<
  object,
  Map<string, Promise<StructuredAgentSessionTerminalAdoptionResult>>
>()

export async function adoptStructuredTerminal(
  context: StructuredTerminalAdoptionContext,
  request: StructuredAgentSessionTerminalAdoptionParams,
  callerKey: string
): Promise<StructuredAgentSessionTerminalAdoptionResult> {
  let pending = inFlight.get(context.runtime)
  if (!pending) {
    pending = new Map()
    inFlight.set(context.runtime, pending)
  }
  const key = `${request.terminal.ptyId}\0${request.agent}\0${request.providerSessionId}`
  const existing = pending.get(key)
  if (existing) {
    return existing
  }
  const task = adopt(context, request, callerKey)
  pending.set(key, task)
  try {
    return await task
  } finally {
    if (pending.get(key) === task) {
      pending.delete(key)
    }
  }
}

function matchingAdoption(
  record: AgentSessionRecord,
  context: StructuredTerminalAdoptionContext,
  request: StructuredAgentSessionTerminalAdoptionParams,
  pty: RuntimePtyWorktreeRecord
): boolean {
  const terminal = record.adoptedTerminal
  const handle = record.providerHandleChain.at(-1)?.handle
  return (
    record.location.workspaceId === context.location.workspaceId &&
    record.location.executionHostId === 'local' &&
    record.location.wslDistro === null &&
    terminal?.ptyId === pty.ptyId &&
    terminal.incarnationId === pty.incarnationId &&
    terminal.paneKey === request.terminal.paneKey &&
    terminal.tabId === request.terminal.tabId &&
    handle?.provider === request.agent &&
    (handle.provider === 'codex' ? handle.threadId : handle.sessionId) === request.providerSessionId
  )
}

async function adopt(
  context: StructuredTerminalAdoptionContext,
  request: StructuredAgentSessionTerminalAdoptionParams,
  callerKey: string
): Promise<StructuredAgentSessionTerminalAdoptionResult> {
  if (request.envelope.expectedRuntimeFence !== null) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_checkpoint_stale',
      'A terminal adoption must start without a structured session fence.'
    )
  }
  const pty = context.readPty()
  const prior = context.host.deps.store
    .listRecords()
    .find((record) => matchingAdoption(record, context, request, pty))
  const boundSessionId = agentSessionPtyWriteGate.boundSessionId(pty.ptyId)
  if (boundSessionId && boundSessionId !== prior?.sessionId) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'This terminal already belongs to another structured conversation.'
    )
  }
  const incarnationId = pty.incarnationId
  if (!incarnationId) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The terminal process incarnation is not available yet.'
    )
  }
  const assertBinding = (): RuntimePtyWorktreeRecord => {
    const current = context.readPty()
    if (current.incarnationId !== incarnationId) {
      throw new StructuredTerminalAdoptionError(
        'agent_session_identity_required',
        'The terminal was replaced while switching to chat.'
      )
    }
    return current
  }
  const listed = (await context.listProcesses(null)).find(
    (entry) => entry.id === pty.ptyId && entry.incarnationId === incarnationId
  )
  if (!listed?.rootProcessId) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The terminal root process could not be proved.'
    )
  }
  let processCommand = ''
  const identity = await readStructuredTuiProcessIdentity({
    hostId: 'local',
    rootPid: listed.rootProcessId,
    spawnToken: randomUUID(),
    agent: request.agent,
    unwrapCodexLauncher: true,
    onProcessCommand: (command) => {
      processCommand = command
    }
  })
  if (identity.processStartTimeMs === null) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The agent process start time could not be verified on this host.'
    )
  }
  // An adopted child may predate Orca's reservation token; its start time remains mandatory.
  identity.spawnToken = (await readEchoedAgentSessionSpawnToken(identity)) ?? identity.spawnToken
  const readProvider = () =>
    selectStructuredTerminalProviderSession({
      paneKey: request.terminal.paneKey,
      incarnationId,
      agent: request.agent,
      providerSessionId: request.providerSessionId,
      launchToken: assertBinding().launchToken,
      processStartTimeMs: identity.processStartTimeMs!,
      rows: context.providerRows()
    })
  const providerSession = readProvider()
  const revalidate = async () => {
    readProvider()
    await assertStructuredTerminalWorkingDirectory(identity.pid, context.workspacePath)
    const proof = await probeAgentSessionProcessIdentity({ identity })
    if (proof.outcome !== 'identity-matched' || proof.matchedOn.length === 0) {
      throw new StructuredTerminalAdoptionError(
        'agent_session_identity_required',
        'The agent process changed while switching to chat.'
      )
    }
    assertBinding()
  }
  await revalidate()
  if (prior) {
    return replayStructuredTerminalAdoption({
      host: context.host,
      prior,
      identity,
      revalidate,
      ptyId: pty.ptyId
    })
  }
  const transcript = await resolveStructuredTerminalTranscript({
    agent: request.agent,
    providerSession,
    candidateAccountHomes: context.accountHomes(pty)
  })
  const launchArgs = structuredTerminalLaunchArgs({
    agent: request.agent,
    command: processCommand,
    providerSessionId: request.providerSessionId
  })
  const owner: StructuredTuiOwner = {
    terminal: { ...request.terminal, handle: context.issueHandle(pty), incarnationId },
    process: identity,
    link:
      request.agent === 'codex'
        ? codexProviderHandleLink({
            threadId: providerSession.id,
            resumed: false,
            origin: 'adopted',
            fence: 1,
            observedAt: Date.now()
          })
        : claudeProviderHandleLink({
            sessionId: providerSession.id,
            leafUuid: transcript.leafUuid,
            resumed: false,
            origin: 'adopted',
            fence: 1,
            observedAt: Date.now()
          }),
    transcriptPath: transcript.transcriptPath,
    adoptedTerminal: true,
    ...(request.agent === 'codex' ? { historySource: 'provider-resume' as const } : {})
  }
  const sessionId = request.envelope.sessionId
  if (
    agentSessionPtyWriteGate.boundSessionId(pty.ptyId) ||
    !agentSessionPtyWriteGate.bindPtyForAttempt(pty.ptyId, sessionId, identity.spawnToken)
  ) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'The terminal changed ownership while switching to chat.'
    )
  }
  try {
    const result = await context.host.registerTerminalOwner({
      callerKey,
      params: {
        envelope: request.envelope,
        location: context.location,
        provider: request.agent,
        agent: request.agent,
        runtimeKind: 'tui',
        launchArgs,
        accountHome: {
          variable: request.agent === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR',
          path: transcript.accountHomePath
        },
        adopt: {
          providerHandle:
            request.agent === 'codex'
              ? { kind: 'codex', threadId: providerSession.id }
              : { kind: 'claude', sessionId: providerSession.id, leafUuid: transcript.leafUuid },
          transcriptPath: transcript.transcriptPath
        }
      },
      owner,
      terminal: { ...request.terminal, incarnationId },
      revalidate
    })
    agentSessionPtyWriteGate.settlePtyAttempt(pty.ptyId, identity.spawnToken)
    return result
  } catch (error) {
    if (context.host.deps.store.getRecord(sessionId)?.adoptedTerminal) {
      agentSessionPtyWriteGate.settlePtyAttempt(pty.ptyId, identity.spawnToken)
    } else {
      agentSessionPtyWriteGate.releasePtyAttempt(pty.ptyId, identity.spawnToken)
    }
    throw error
  }
}
