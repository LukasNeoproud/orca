import { mkdir, rmdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expandTilde } from './context'

/** One method guarantees a host accepting reservations can also safely release them. */
export async function handleEmptyDirectoryReservation(
  params: Record<string, unknown>
): Promise<void> {
  if (
    typeof params.dirPath !== 'string' ||
    !params.dirPath ||
    !['reserve', 'release'].includes(String(params.action))
  ) {
    throw new Error('Invalid empty directory reservation request.')
  }
  const path = expandTilde(params.dirPath)
  if (params.action === 'reserve') {
    await mkdir(dirname(path), { recursive: true })
    await mkdir(path)
  } else {
    await rmdir(path)
  }
}
