import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readStructuredTerminalCodexRollouts,
  writableLsofFiles
} from './structured-terminal-codex-rollout-proof'

const mocks = vi.hoisted(() => ({ runProcess: vi.fn() }))
vi.mock('../../shared/child-process/run-process', () => ({ runProcess: mocks.runProcess }))

const PID = 87910
let root: string

beforeEach(async () => {
  vi.clearAllMocks()
  root = await mkdtemp(join(tmpdir(), 'orca-open-codex-rollout-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function rollout(name: string, id: string, source: unknown = 'cli'): Promise<string> {
  const path = join(root, `rollout-${name}.jsonl`)
  await writeFile(path, JSON.stringify({ type: 'session_meta', payload: { id, source } }))
  return realpath(path)
}

function readFiles(paths: string[] | null) {
  return { readFiles: vi.fn(async () => paths) }
}

describe('writable Codex conversation proof', () => {
  it('parses only writable regular files of the exact PID, preserving spaces and newlines', () => {
    const output = [
      `p${PID}\0`,
      'fcwd\0au\0tDIR\0n/workspace\0',
      'f4\0ar\0tREG\0n/read-only.jsonl\0',
      'f40\0au\0tREG\0n/account home/rollout-main.jsonl\0',
      'f41\0aw\0tREG\0n/account\nname/rollout-next.jsonl\0',
      'f42\0au\0tIPv4\0n/socket\0',
      `p${PID + 1}\0`,
      'f40\0au\0tREG\0n/another-process.jsonl\0'
    ].join('\n')
    expect(writableLsofFiles(output, PID)).toEqual([
      '/account home/rollout-main.jsonl',
      '/account\nname/rollout-next.jsonl'
    ])
  })

  it('reads the resumed main conversation while the same process owns a guardian rollout', async () => {
    const main = await rollout('resumed', 'resumed-thread')
    const guardian = await rollout('guardian', 'guardian-thread', {
      subagent: { other: 'guardian' }
    })
    const files = readFiles([guardian, main])
    await expect(readStructuredTerminalCodexRollouts(PID, files)).resolves.toEqual([
      { key: 'session_id', id: 'resumed-thread', transcriptPath: main }
    ])
    expect(files.readFiles).toHaveBeenCalledExactlyOnceWith(PID)
  })

  it('keeps different writable files ambiguous even when they claim the same thread ID', async () => {
    const first = await rollout('first-account', 'same-thread')
    const second = await rollout('second-account', 'same-thread')
    await expect(
      readStructuredTerminalCodexRollouts(PID, readFiles([first, second]))
    ).resolves.toEqual([
      { key: 'session_id', id: 'same-thread', transcriptPath: first },
      { key: 'session_id', id: 'same-thread', transcriptPath: second }
    ])
  })

  it.skipIf(process.platform === 'win32')(
    'deduplicates aliases of the same canonical rollout',
    async () => {
      const main = await rollout('main', 'main-thread')
      const alias = join(root, 'rollout-alias.jsonl')
      await symlink(main, alias)
      await expect(
        readStructuredTerminalCodexRollouts(PID, readFiles([main, main, alias]))
      ).resolves.toEqual([{ key: 'session_id', id: 'main-thread', transcriptPath: main }])
    }
  )

  it.each(['missing', 'malformed', 'unknown-source'])(
    'does not select a readable candidate when another candidate is %s',
    async (kind) => {
      const main = await rollout('main', 'main-thread')
      const unknown = join(root, 'rollout-unknown.jsonl')
      if (kind === 'malformed') {
        await writeFile(unknown, '{"type":"session_meta"')
      } else if (kind === 'unknown-source') {
        await writeFile(
          unknown,
          JSON.stringify({
            type: 'session_meta',
            payload: { id: 'unknown-thread', source: { unfamiliar: true } }
          })
        )
      }
      await expect(
        readStructuredTerminalCodexRollouts(PID, readFiles([main, unknown]))
      ).resolves.toBeNull()
    }
  )

  it('distinguishes no rollout from an unavailable process inspection', async () => {
    await expect(readStructuredTerminalCodexRollouts(PID, readFiles([]))).resolves.toEqual([])
    await expect(readStructuredTerminalCodexRollouts(PID, readFiles(null))).resolves.toBeNull()
    await expect(
      readStructuredTerminalCodexRollouts(PID, { platform: 'win32' })
    ).resolves.toBeNull()
    expect(mocks.runProcess).not.toHaveBeenCalled()
  })

  it('uses a bounded PID-scoped macOS inspection and reads only its writable rollout', async () => {
    const main = await rollout('main', 'main-thread')
    mocks.runProcess.mockResolvedValueOnce({
      code: 0,
      stdout: `p${PID}\0\nf40\0au\0tREG\0n${main}\0`,
      timedOut: false,
      outputTruncated: false
    })
    await expect(readStructuredTerminalCodexRollouts(PID, { platform: 'darwin' })).resolves.toEqual(
      [{ key: 'session_id', id: 'main-thread', transcriptPath: main }]
    )
    expect(mocks.runProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        program: '/usr/sbin/lsof',
        args: ['-nP', '-a', '-p', String(PID), '-F0pftan'],
        timeoutMs: expect.any(Number),
        maxOutputBytes: expect.any(Number)
      })
    )
  })

  it.each([{ code: 1 }, { timedOut: true }, { outputTruncated: true }])(
    'refuses incomplete macOS inspection: %j',
    async (failure) => {
      const main = await rollout('main', 'main-thread')
      mocks.runProcess.mockResolvedValueOnce({
        code: 0,
        stdout: `p${PID}\0\nf40\0au\0tREG\0n${main}\0`,
        timedOut: false,
        outputTruncated: false,
        ...failure
      })
      await expect(
        readStructuredTerminalCodexRollouts(PID, { platform: 'darwin' })
      ).resolves.toBeNull()
    }
  )
})
