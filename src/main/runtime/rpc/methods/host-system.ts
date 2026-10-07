import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { collectHostSystemSnapshot } from '../../../host-system/host-system-snapshot'
import { setHostPowerMode } from '../../../host-system/host-power-mode'
import { terminateHostProcess } from '../../../host-system/host-process-termination'

const SnapshotParams = z
  .object({ includeProcesses: z.boolean().optional() })
  .nullish()
  .transform((value) => ({ includeProcesses: value?.includeProcesses === true }))

const SetPowerModeParams = z.object({ mode: z.enum(['automatic', 'low-power']) })

const TerminateProcessParams = z.object({
  pid: z.number().int().positive(),
  expectedName: z.string().min(1).max(512),
  force: z.boolean().optional()
})

// Why: the execution host owns these reads and writes; paired clients only render and request.
export const HOST_SYSTEM_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'hostSystem.snapshot',
    params: SnapshotParams,
    handler: async (params) => collectHostSystemSnapshot(params)
  }),
  defineMethod({
    name: 'hostSystem.setPowerMode',
    params: SetPowerModeParams,
    handler: async (params) => setHostPowerMode(process.platform, params.mode)
  }),
  defineMethod({
    name: 'hostSystem.terminateProcess',
    params: TerminateProcessParams,
    handler: async (params) =>
      terminateHostProcess({
        platform: process.platform,
        pid: params.pid,
        expectedName: params.expectedName,
        force: params.force === true
      })
  })
]
