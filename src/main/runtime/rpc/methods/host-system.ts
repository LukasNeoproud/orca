import {
  HostSystemSnapshotParams,
  HostSystemSetPowerModeParams,
  HostSystemTerminateProcessParams
} from '../../../../shared/rpc-contract/host-system-params'
import { defineMethod } from '../core'
import { collectHostSystemSnapshot } from '../../../host-system/host-system-snapshot'
import { setHostPowerMode } from '../../../host-system/host-power-mode'
import { terminateHostProcess } from '../../../host-system/host-process-termination'

// Why: the execution host owns these reads and writes; paired clients only render and request.
export const HOST_SYSTEM_METHODS = [
  defineMethod({
    name: 'hostSystem.snapshot',
    permission: 'workspace',
    params: HostSystemSnapshotParams,
    handler: async (params) => collectHostSystemSnapshot(params)
  }),
  defineMethod({
    name: 'hostSystem.setPowerMode',
    permission: 'host-admin',
    params: HostSystemSetPowerModeParams,
    handler: async (params) => setHostPowerMode(process.platform, params.mode)
  }),
  defineMethod({
    name: 'hostSystem.terminateProcess',
    permission: 'host-admin',
    params: HostSystemTerminateProcessParams,
    handler: async (params) =>
      terminateHostProcess({
        platform: process.platform,
        pid: params.pid,
        expectedName: params.expectedName,
        force: params.force === true
      })
  })
]
