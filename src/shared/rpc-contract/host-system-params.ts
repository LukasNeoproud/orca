import { z } from 'zod'

export const HostSystemSnapshotParams = z
  .object({ includeProcesses: z.boolean().optional() })
  .nullish()
  .transform((value) => ({ includeProcesses: value?.includeProcesses === true }))

export const HostSystemSetPowerModeParams = z.object({ mode: z.enum(['automatic', 'low-power']) })

export const HostSystemTerminateProcessParams = z.object({
  pid: z.number().int().positive(),
  expectedName: z.string().min(1).max(512),
  force: z.boolean().optional()
})
