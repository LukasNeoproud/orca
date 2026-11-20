import { stat } from 'node:fs/promises'
import path from 'node:path'

type PathApi = Pick<typeof path, 'dirname' | 'isAbsolute' | 'normalize' | 'relative' | 'sep'>

type ProjectRootDeps = {
  pathApi?: PathApi
  isDirectory?: (pathValue: string) => Promise<boolean>
}

async function isExistingDirectory(pathValue: string): Promise<boolean> {
  try {
    return (await stat(pathValue)).isDirectory()
  } catch {
    return false
  }
}

/**
 * The renderer's workspace root for `filePath`, or undefined unless it is an existing absolute
 * folder that holds the file and `filePath` is not a folder. Undefined launches without a folder.
 */
export async function resolveExternalEditorProjectRoot(
  projectRoot: unknown,
  filePath: string,
  deps: ProjectRootDeps = {}
): Promise<string | undefined> {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    return undefined
  }
  const pathApi = deps.pathApi ?? path
  const root = pathApi.normalize(projectRoot)
  // Why: a filesystem root would open the whole disk as the editor's workspace.
  if (!pathApi.isAbsolute(root) || pathApi.dirname(root) === root) {
    return undefined
  }
  // Why: relative() resolves `..` and, on Windows, ignores case and refuses another drive.
  const relative = pathApi.relative(root, filePath)
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${pathApi.sep}`) ||
    pathApi.isAbsolute(relative)
  ) {
    return undefined
  }
  const isDirectory = deps.isDirectory ?? isExistingDirectory
  // Why: a folder target is its own project; a root before it would open two windows.
  return (await isDirectory(root)) && !(await isDirectory(filePath)) ? root : undefined
}
