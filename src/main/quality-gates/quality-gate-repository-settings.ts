import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { normalizeQualityGateFeedbackLoopSettings } from '../../shared/quality-gate-feedback-loop'
import type { QualityGateRepositorySettings } from '../../shared/quality-gate-repository-settings'
import { normalizeQualityGateDefinitions } from '../../shared/quality-gate-types'
import type { Repo } from '../../shared/repo-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { RpcCallerIdentity } from '../runtime/rpc/rpc-caller-identity'

type SettingsRuntime = Pick<OrcaRuntimeService, 'showRepo' | 'updateRepo'>

type RepositorySettingsRow = Pick<Repo, 'qualityGates' | 'qualityGateFeedbackLoop'>

/**
 * Definitions are the user's own: a caller that could write them would check its work with a
 * command of its choice. The host tells callers apart by the transport alone. The runtime socket
 * is what `orca`, its MCP servers and every agent on this host call through, and it is refused; so
 * is a caller the transport could not name. What is left is this host's own window and the
 * authenticated socket of a paired Orca app. A phone never gets here: the method is not on the
 * mobile allowlist.
 */
export function assertQualityGateRepositorySettingsCaller(
  caller: RpcCallerIdentity | undefined
): void {
  if (caller?.kind !== 'desktop' && caller?.kind !== 'paired-device') {
    throw new Error(
      'Quality gates of a repository are set up only in the Orca app, by the user. The CLI and agents can run them, not define them.'
    )
  }
}

function settingsOf(row: RepositorySettingsRow): QualityGateRepositorySettings {
  return {
    gates: normalizeQualityGateDefinitions(row.qualityGates) ?? [],
    feedbackLoop: normalizeQualityGateFeedbackLoopSettings(row.qualityGateFeedbackLoop)
  }
}

/**
 * Writes the gates and the loop of a repository this host keeps, for a paired Orca app whose user
 * set them up in its window. Same row and same normalizers as the host's own `repos:update`.
 */
export async function writeQualityGateRepositorySettings(
  runtime: SettingsRuntime,
  caller: RpcCallerIdentity | undefined,
  params: { repo: string; gates?: unknown; feedbackLoop?: unknown }
): Promise<QualityGateRepositorySettings> {
  assertQualityGateRepositorySettingsCaller(caller)
  const repo = await runtime.showRepo(params.repo)
  // A row of another host is a copy: its gates run from that host's row, not from this one.
  if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
    throw new Error(
      'This repository belongs to another host. Its quality gates are kept in Orca on that host.'
    )
  }
  const updates: RepositorySettingsRow = {}
  if (params.gates !== undefined) {
    const gates = normalizeQualityGateDefinitions(params.gates)
    if (!gates) {
      throw new Error('The quality gates must be a list.')
    }
    updates.qualityGates = gates
  }
  if (params.feedbackLoop !== undefined) {
    updates.qualityGateFeedbackLoop = normalizeQualityGateFeedbackLoopSettings(params.feedbackLoop)
  }
  if (Object.keys(updates).length === 0) {
    throw new Error('No quality gate setting was given to write.')
  }
  const updated = await runtime.updateRepo(
    params.repo,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the runtime passes every given field to the store, whose updateRepo takes both; its own type leaves them out so that repo.update cannot name them.
    updates as Parameters<SettingsRuntime['updateRepo']>[1]
  )
  console.info(
    `[quality-gates] settings of repository ${repo.id} written by ${
      caller?.kind === 'paired-device' ? `paired device ${caller.deviceId}` : 'the desktop app'
    }`
  )
  return settingsOf(updated)
}
