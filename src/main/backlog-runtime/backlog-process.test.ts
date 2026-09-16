import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnBacklogProcess } from './backlog-process'

afterEach(() => vi.unstubAllEnvs())

describe.skipIf(process.platform === 'win32')('Backlog native process', () => {
  it('sets BACKLOG_CWD to the selected workspace despite an inherited value', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-backlog-process-'))
    const program = join(root, 'backlog')
    try {
      await writeFile(program, '#!/bin/sh\nprintf "%s\\n" "$BACKLOG_CWD"\n')
      await chmod(program, 0o755)
      vi.stubEnv('PATH', `${root}:${process.env.PATH ?? ''}`)
      vi.stubEnv('BACKLOG_CWD', '/wrong-workspace')
      const child = await spawnBacklogProcess({ kind: 'native', cwd: root }, ['task', 'list'])
      let output = ''
      child.onStdout((chunk) => {
        output += chunk.toString()
      })
      const code = await new Promise<number | null>((resolve, reject) => {
        child.onExit(resolve)
        child.onError(reject)
      })
      expect(code).toBe(0)
      expect(output.trim()).toBe(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
