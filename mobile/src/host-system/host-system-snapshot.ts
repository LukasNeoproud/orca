import AsyncStorage from '@react-native-async-storage/async-storage'
import { z } from 'zod'
import type { HostSystemSnapshot } from '../../../src/shared/host-system-types'

const THERMAL = z.enum(['nominal', 'fair', 'serious', 'critical'])

// Why parse: a newer or older host may publish shapes this build never saw; drop, don't crash.
const SnapshotSchema = z.object({
  platform: z.string(),
  collectedAt: z.number(),
  battery: z.object({ percent: z.number(), charging: z.boolean() }).nullable(),
  thermalState: THERMAL.nullable().catch(null),
  powerMode: z
    .object({
      current: z.enum(['automatic', 'low-power', 'high-power']).nullable().catch(null),
      switchable: z.boolean()
    })
    .nullable(),
  disks: z
    .array(
      z.object({
        label: z.string(),
        totalBytes: z.number(),
        availableBytes: z.number(),
        level: z.enum(['ok', 'warning', 'critical']).catch('ok'),
        fullInSeconds: z.number().nullable()
      })
    )
    .max(16),
  processes: z
    .array(
      z.object({
        pid: z.number(),
        name: z.string(),
        cpuPercent: z.number(),
        memoryBytes: z.number(),
        networkBytesPerSecond: z.number().nullable()
      })
    )
    .max(200)
    .nullable()
})

export function parseHostSystemSnapshot(value: unknown): HostSystemSnapshot | null {
  const parsed = SnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

const storageKey = (hostId: string): string => `orca:host-system:last:${hostId}`

/** The last snapshot is what the screen shows when the host stops answering (e.g. a full disk). */
export async function saveLastHostSystemSnapshot(
  hostId: string,
  snapshot: HostSystemSnapshot
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(hostId), JSON.stringify({ ...snapshot, processes: null }))
  } catch {
    // Losing the offline copy only costs the offline view.
  }
}

export async function loadLastHostSystemSnapshot(
  hostId: string
): Promise<HostSystemSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(hostId))
    return raw ? parseHostSystemSnapshot(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
