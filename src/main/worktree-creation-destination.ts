import { mkdir, rmdir } from 'node:fs/promises'
import { posix, win32 } from 'node:path'

/** Reserve only the selected leaf; Git accepts our empty directory, but no competing destination. */
export async function reserveWorktreeCreationDestination(
  path: string
): Promise<() => Promise<void>> {
  const pathOps = /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? win32 : posix
  await mkdir(pathOps.dirname(path), { recursive: true })
  await mkdir(path)
  return async () => {
    // Only remove an empty reservation; late Git failures may have materialized a checkout.
    try {
      await rmdir(path)
    } catch {
      /* The existing creation cleanup owns any nonempty checkout. */
    }
  }
}
