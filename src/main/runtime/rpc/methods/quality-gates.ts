import {
  QualityGateCancelParams,
  QualityGateOutputParams,
  QualityGateRunParams,
  QualityGateWorktreeParams
} from '../../../../shared/rpc-contract/quality-gate-params'
import type { QualityGateRunStarter } from '../../../../shared/quality-gate-types'
import { getQualityGateService } from '../../../quality-gates/quality-gate-host'
import { resolveQualityGateTarget } from '../../../quality-gates/quality-gate-target'
import { defineMethod } from '../core'
import type { RpcCallerIdentity } from '../rpc-caller-identity'

/** A run records who asked for it, so a caller the transport could not name starts none. */
function runStarter(caller: RpcCallerIdentity | undefined): QualityGateRunStarter {
  if (!caller) {
    throw new Error('Quality gates can only be started by a caller this host can identify.')
  }
  return caller.kind === 'paired-device'
    ? { kind: 'paired-device', deviceId: caller.deviceId }
    : { kind: caller.kind }
}

// Why no method writes a gate: the runtime socket is what agents and the CLI call through, and a
// caller that could define the command would be checking its own work with a command of its choice.
// Gates are written by the app's own window (repos:update) and only run from here.
export const QUALITY_GATE_METHODS = [
  defineMethod({
    name: 'qualityGates.list',
    permission: 'workspace',
    params: QualityGateWorktreeParams,
    handler: async (params, { runtime }) =>
      getQualityGateService().list(await resolveQualityGateTarget(runtime, params.worktree))
  }),
  defineMethod({
    name: 'qualityGates.run',
    permission: 'workspace',
    params: QualityGateRunParams,
    handler: async (params, { runtime, caller }) => {
      const startedBy = runStarter(caller)
      return getQualityGateService().run(
        await resolveQualityGateTarget(runtime, params.worktree),
        params.gateIds,
        startedBy
      )
    }
  }),
  defineMethod({
    name: 'qualityGates.status',
    permission: 'workspace',
    params: QualityGateWorktreeParams,
    handler: async (params, { runtime }) =>
      getQualityGateService().status(await resolveQualityGateTarget(runtime, params.worktree))
  }),
  defineMethod({
    name: 'qualityGates.output',
    permission: 'workspace',
    params: QualityGateOutputParams,
    handler: async (params, { runtime }) =>
      getQualityGateService().output(
        await resolveQualityGateTarget(runtime, params.worktree),
        params.runId
      )
  }),
  defineMethod({
    name: 'qualityGates.cancel',
    permission: 'workspace',
    params: QualityGateCancelParams,
    handler: async (params, { runtime }) =>
      getQualityGateService().cancel(await resolveQualityGateTarget(runtime, params.worktree), {
        runId: params.runId,
        gateId: params.gateId
      })
  })
]
