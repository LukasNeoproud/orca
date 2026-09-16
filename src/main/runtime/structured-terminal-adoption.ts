import { randomUUID } from 'node:crypto'
import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'
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
  resolveStructuredTerminalProviderSession
} from './structured-terminal-provider-proof'
import { structuredTerminalLaunchArgs } from './structured-terminal-launch-args'
import { planStructuredTerminalAdoption } from './structured-terminal-adoption-admission'

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
  const pty = context.readPty()
  const key = [
    context.location.workspaceId,
    request.terminal.ptyId,
    pty.incarnationId,
    request.terminal.paneKey,
    request.agent
  ].join('\0')
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
    resolveStructuredTerminalProviderSession({
      pid: identity.pid,
      paneKey: request.terminal.paneKey,
      incarnationId,
      agent: request.agent,
      providerSessionId: request.providerSessionId,
      launchToken: assertBinding().launchToken,
      processStartTimeMs: identity.processStartTimeMs!,
      rows: context.providerRows()
    })
  const providerSession = await readProvider()
  const revalidate = async () => {
    const current = await readProvider()
    if (
      current.id !== providerSession.id ||
      current.transcriptPath !== providerSession.transcriptPath
    ) {
      throw new StructuredTerminalAdoptionError(
        'agent_session_identity_required',
        'The terminal switched conversations during this request. Retry the current conversation.'
      )
    }
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
  const transcript = await resolveStructuredTerminalTranscript({
    agent: request.agent,
    providerSession,
    candidateAccountHomes: context.accountHomes(pty)
  })
  const plan = planStructuredTerminalAdoption({
    context,
    pty,
    process: identity,
    agent: request.agent,
    providerSessionId: providerSession.id,
    accountHomePath: transcript.accountHomePath
  })
  const launchArgs = structuredTerminalLaunchArgs({
    agent: request.agent,
    command: processCommand,
    providerSessionId: providerSession.id
  })
  const owner: StructuredTuiOwner = {
    terminal: { ...request.terminal, handle: context.issueHandle(pty), incarnationId },
    process: identity,
    link:
      request.agent === 'codex'
        ? codexProviderHandleLink({
            threadId: providerSession.id,
            resumed: Boolean(plan.existing),
            ...(plan.existing ? {} : { origin: 'adopted' as const }),
            fence: plan.fence,
            observedAt: Date.now()
          })
        : claudeProviderHandleLink({
            sessionId: providerSession.id,
            leafUuid: transcript.leafUuid,
            resumed: Boolean(plan.existing),
            ...(plan.existing ? {} : { origin: 'adopted' as const }),
            fence: plan.fence,
            observedAt: Date.now()
          }),
    transcriptPath: transcript.transcriptPath,
    adoptedTerminal: true,
    ...(request.agent === 'codex' ? { historySource: 'provider-resume' as const } : {})
  }
  const sessionId = plan.existing?.sessionId ?? request.envelope.sessionId
  const boundBefore = agentSessionPtyWriteGate.boundSessionId(pty.ptyId)
  if (
    (boundBefore !== null &&
      boundBefore !== sessionId &&
      boundBefore !== plan.previous?.sessionId) ||
    (boundBefore === null &&
      !agentSessionPtyWriteGate.bindPtyForAttempt(pty.ptyId, sessionId, identity.spawnToken))
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
        envelope: { ...request.envelope, sessionId },
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
      revalidate,
      existing: plan.existing,
      previous: plan.previous
    })
    agentSessionPtyWriteGate.bindPty(pty.ptyId, result.sessionId)
    return result
  } catch (error) {
    if (
      error instanceof StructuredTerminalAdoptionError &&
      error.code === 'agent_session_adoption_unconfirmed'
    ) {
      agentSessionPtyWriteGate.bindPty(pty.ptyId, sessionId)
    } else if (boundBefore === null) {
      agentSessionPtyWriteGate.releasePtyAttempt(pty.ptyId, identity.spawnToken)
    }
    throw error
  }
}
