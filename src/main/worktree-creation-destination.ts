import { mkdir, rmdir } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import type { IFilesystemProvider } from './providers/types'

/** Reserve only the selected leaf; Git accepts our empty directory, but no competing destination. */
export async function reserveWorktreeCreationDestination(
  path: string,
  fs?: IFilesystemProvider
): Promise<() => Promise<void>> {
  const pathOps = /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? win32 : posix
  if (fs) {
    if (!fs.reserveEmptyDirectory || !fs.removeEmptyDirectory) {
      throw new Error(
        'This SSH host does not support safe worktree destination reservations. Reconnect to update it.'
      )
    }
    await fs.reserveEmptyDirectory(path)
  } else {
    await mkdir(pathOps.dirname(path), { recursive: true })
    await mkdir(path)
  }
  return async () => {
    // Only remove an empty reservation; late Git failures may have materialized a checkout.
    try {
      await (fs ? fs.removeEmptyDirectory!(path) : rmdir(path))
    } catch {
      /* The existing creation cleanup owns any nonempty checkout. */
    }
  }
}
