import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reserveWorktreeCreationDestination } from './worktree-creation-destination'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-reservation-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('worktree directory reservations', () => {
  it('releases an empty reservation after failed creation so retry succeeds', async () => {
    const path = join(root, 'nested', 'topic')
    const cleanup = await reserveWorktreeCreationDestination(path)
    await cleanup()
    const retryCleanup = await reserveWorktreeCreationDestination(path)
    expect(await readdir(path)).toEqual([])
    await retryCleanup()
  })

  it('preserves a file written after reservation and before cleanup', async () => {
    const path = join(root, 'topic')
    const cleanup = await reserveWorktreeCreationDestination(path)
    await writeFile(join(path, 'user-file'), 'keep')
    await cleanup()
    expect(await readFile(join(path, 'user-file'), 'utf8')).toBe('keep')
  })

  it('refuses a destination that already exists', async () => {
    const path = join(root, 'topic')
    await reserveWorktreeCreationDestination(path)
    await expect(reserveWorktreeCreationDestination(path)).rejects.toThrow()
  })
})
