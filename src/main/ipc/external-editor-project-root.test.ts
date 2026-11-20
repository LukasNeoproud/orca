import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path, { posix, win32 } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveExternalEditorProjectRoot } from './external-editor-project-root'

// Why: every path but the target file is an existing folder.
const foldersExcept =
  (file: string) =>
  async (candidate: string): Promise<boolean> =>
    candidate !== file

describe('resolveExternalEditorProjectRoot on POSIX paths', () => {
  const resolveRoot = (root: unknown, file: string): Promise<string | undefined> =>
    resolveExternalEditorProjectRoot(root, file, {
      pathApi: posix,
      isDirectory: foldersExcept(file)
    })

  it('accepts the folder that holds the file', async () => {
    await expect(resolveRoot('/work/repo', '/work/repo/src/App.kt')).resolves.toBe('/work/repo')
  })

  it('normalizes the root it returns', async () => {
    await expect(resolveRoot('/work/./repo/../repo', '/work/repo/App.kt')).resolves.toBe(
      '/work/repo'
    )
  })

  it.each([
    ['a sibling folder sharing a prefix', '/work/repo', '/work/repo-other/App.kt'],
    ['a folder the file is not in', '/work/other', '/work/repo/App.kt'],
    ['a root that climbs out with ..', '/work/repo/src/..', '/work/App.kt'],
    ['the file itself', '/work/repo/App.kt', '/work/repo/App.kt'],
    ['a relative root', 'repo', '/work/repo/App.kt'],
    ['the filesystem root', '/', '/work/repo/App.kt'],
    ['an empty root', '  ', '/work/repo/App.kt'],
    ['a root that is not a string', 42, '/work/repo/App.kt']
  ])('refuses %s', async (_label, root, file) => {
    await expect(resolveRoot(root, file)).resolves.toBeUndefined()
  })

  it('accepts a file whose name starts with two dots', async () => {
    await expect(resolveRoot('/work/repo', '/work/repo/..env')).resolves.toBe('/work/repo')
  })

  it('refuses a root when the target is a folder itself', async () => {
    await expect(
      resolveExternalEditorProjectRoot('/work/repo', '/work/repo/src', {
        pathApi: posix,
        isDirectory: async () => true
      })
    ).resolves.toBeUndefined()
  })

  it('refuses a root that is not an existing folder', async () => {
    await expect(
      resolveExternalEditorProjectRoot('/work/repo', '/work/repo/App.kt', {
        pathApi: posix,
        isDirectory: async () => false
      })
    ).resolves.toBeUndefined()
  })
})

describe('resolveExternalEditorProjectRoot on Windows paths', () => {
  const resolveRoot = (root: string, file: string): Promise<string | undefined> =>
    resolveExternalEditorProjectRoot(root, file, {
      pathApi: win32,
      isDirectory: foldersExcept(file)
    })

  it('accepts the folder that holds the file', async () => {
    await expect(
      resolveRoot('C:\\Users\\Ada Lovelace\\repo', 'C:\\Users\\Ada Lovelace\\repo\\App.kt')
    ).resolves.toBe('C:\\Users\\Ada Lovelace\\repo')
  })

  it('accepts a root spelled with another case or forward slashes', async () => {
    await expect(resolveRoot('c:/users/ada/REPO', 'C:\\Users\\Ada\\repo\\App.kt')).resolves.toBe(
      'c:\\users\\ada\\REPO'
    )
  })

  it.each([
    ['another drive', 'D:\\repo', 'C:\\repo\\App.kt'],
    ['a drive root', 'C:\\', 'C:\\repo\\App.kt'],
    ['a drive-relative root', 'C:repo', 'C:\\repo\\App.kt'],
    ['a sibling folder sharing a prefix', 'C:\\repo', 'C:\\repo-other\\App.kt'],
    ['a root that climbs out with ..', 'C:\\repo\\src\\..\\..', 'D:\\App.kt']
  ])('refuses %s', async (_label, root, file) => {
    await expect(resolveRoot(root, file)).resolves.toBeUndefined()
  })

  it('accepts a UNC share folder that holds the file', async () => {
    await expect(
      resolveRoot('\\\\server\\share\\repo', '\\\\server\\share\\repo\\App.kt')
    ).resolves.toBe('\\\\server\\share\\repo')
  })
})

describe('resolveExternalEditorProjectRoot against the disk', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'orca-project-root-'))
    mkdirSync(path.join(dir, 'notes'))
    writeFileSync(path.join(dir, 'notes', 'todo.md'), '# todo\n')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('accepts a folder workspace without git', async () => {
    await expect(
      resolveExternalEditorProjectRoot(dir, path.join(dir, 'notes', 'todo.md'))
    ).resolves.toBe(path.normalize(dir))
  })

  it('refuses a folder that does not exist', async () => {
    const gone = path.join(dir, 'gone')
    await expect(
      resolveExternalEditorProjectRoot(gone, path.join(gone, 'todo.md'))
    ).resolves.toBeUndefined()
  })

  it('refuses a root for a folder inside it', async () => {
    await expect(
      resolveExternalEditorProjectRoot(dir, path.join(dir, 'notes'))
    ).resolves.toBeUndefined()
  })

  it('refuses a root that is a file', async () => {
    const file = path.join(dir, 'notes', 'todo.md')
    await expect(
      resolveExternalEditorProjectRoot(file, path.join(file, 'inner'))
    ).resolves.toBeUndefined()
  })
})
