import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { AgentProviderSessionMetadata } from '../../shared/agent-session-resume'
import { relativePathInsideRoot } from '../../shared/cross-platform-path'
import { selectExactWorkerProviderSession } from './orchestration/worker-provider-session'
import { resolvePinnedCodexRolloutProof } from '../codex/codex-tui-rollout-proof'
import {
  resolveSessionFilePath,
  readClaudeTranscriptLeafUuid
} from '../native-chat/session-file-resolver'
import { StructuredTerminalAdoptionError } from '../native-chat/agent-session-wire/structured-agent-session-terminal-adoption'
import { resolveProcessCwd } from '../providers/process-cwd'
import { readStructuredTerminalCodexRollouts } from './structured-terminal-codex-rollout-proof'

export async function assertStructuredTerminalWorkingDirectory(
  pid: number,
  workspacePath: string
): Promise<void> {
  const reported = await resolveProcessCwd(pid)
  const [current, expected] = await Promise.all([
    reported ? realpath(reported).catch(() => null) : Promise.resolve(null),
    realpath(workspacePath).catch(() => null)
  ])
  if (!current || !expected) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The terminal agent working directory could not be verified. Keep using terminal view on this host.'
    )
  }
  if (current !== expected) {
    throw new StructuredTerminalAdoptionError(
      'structured_agent_session_unsupported',
      'The agent runs outside this workspace directory. Keep using terminal view to preserve its working directory and permissions.'
    )
  }
}

type TerminalProviderProofInput = {
  paneKey: string
  incarnationId: string
  agent: 'codex' | 'claude'
  providerSessionId?: string
  launchToken: string | null
  processStartTimeMs: number
  rows: readonly AgentStatusIpcPayload[]
}

export async function resolveStructuredTerminalProviderSession(
  input: TerminalProviderProofInput & { pid: number }
): Promise<AgentProviderSessionMetadata> {
  if (input.agent !== 'codex') {
    return selectStructuredTerminalProviderSession({ ...input, providerSessionId: undefined })
  }
  const rollouts = await readStructuredTerminalCodexRollouts(input.pid)
  if (rollouts?.length === 1) {
    return rollouts[0]!
  }
  throw new StructuredTerminalAdoptionError(
    'agent_session_identity_required',
    rollouts && rollouts.length > 1
      ? 'Codex has more than one active conversation in this terminal. Keep using terminal view until the current conversation can be identified.'
      : 'Orca could not identify the current Codex conversation yet. Keep the terminal open and try again.'
  )
}

export function selectStructuredTerminalProviderSession(
  input: TerminalProviderProofInput
): AgentProviderSessionMetadata {
  const selected = selectExactWorkerProviderSession({
    paneKey: input.paneKey,
    processIncarnation: input.incarnationId,
    connectionId: null,
    launchToken: input.launchToken,
    observedAfter: input.processStartTimeMs,
    includeIdentityOnly: true,
    statuses: input.rows
      .filter(
        (row) =>
          !row.restoredUnconfirmed &&
          (!row.observation ||
            row.observation.origin === 'hook' ||
            row.observation.origin === 'osc')
      )
      .map((row) => ({ ...row, receivedAt: row.evidenceObservedAt ?? row.receivedAt }))
  })
  if (
    !selected ||
    selected.agent !== input.agent ||
    (input.providerSessionId !== undefined &&
      selected.providerSession.id !== input.providerSessionId)
  ) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The current terminal has not proved this conversation. Finish a turn in the agent, then switch to chat again.'
    )
  }
  return selected.providerSession
}

export async function resolveStructuredTerminalTranscript(input: {
  agent: 'codex' | 'claude'
  providerSession: AgentProviderSessionMetadata
  candidateAccountHomes: readonly string[]
}): Promise<{ accountHomePath: string; transcriptPath: string; leafUuid: string | null }> {
  const expectedPath = input.providerSession.transcriptPath
    ? await realpath(input.providerSession.transcriptPath).catch(() => null)
    : null
  if (input.providerSession.transcriptPath && !expectedPath) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The terminal transcript is no longer readable.'
    )
  }
  const matches = new Map<string, { accountHomePath: string; transcriptPath: string }>()
  for (const accountHome of new Set(input.candidateAccountHomes)) {
    const accountHomePath = await realpath(accountHome).catch(() => null)
    if (!accountHomePath || matches.has(accountHomePath)) {
      continue
    }
    const file =
      input.agent === 'codex'
        ? await resolvePinnedCodexRolloutProof(accountHomePath, input.providerSession.id)
        : await resolveSessionFilePath('claude', input.providerSession.id, {
            claudeProjectsDir: join(accountHomePath, 'projects'),
            ...(expectedPath ? { transcriptPath: expectedPath } : {})
          })
    const transcriptPath = file ? await realpath(file).catch(() => null) : null
    if (
      !transcriptPath ||
      (expectedPath && expectedPath !== transcriptPath) ||
      relativePathInsideRoot(accountHomePath, transcriptPath) === null
    ) {
      continue
    }
    matches.set(accountHomePath, { accountHomePath, transcriptPath })
  }
  if (matches.size !== 1) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The terminal conversation could not be matched to one readable account transcript. Finish a turn before switching to chat.'
    )
  }
  const matched = [...matches.values()][0]!
  return {
    ...matched,
    leafUuid:
      input.agent === 'claude'
        ? await readClaudeTranscriptLeafUuid(matched.transcriptPath, input.providerSession.id, null)
        : null
  }
}
