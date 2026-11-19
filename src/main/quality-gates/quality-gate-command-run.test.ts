import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QUALITY_GATE_OUTPUT_TAIL_BYTES } from '../../shared/quality-gate-types'
import { runQualityGateCommand } from './quality-gate-command-run'

// Real processes: the point is the shell, the time limit and the process tree.
describe.skipIf(process.platform === 'win32')('runQualityGateCommand', () => {
  let cwd: string

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-run-')))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  function run(command: string, options: { timeoutSeconds?: number; signal?: AbortSignal } = {}) {
    return runQualityGateCommand({
      runId: 'run-1',
      command,
      timeoutSeconds: options.timeoutSeconds ?? 20,
      target: { kind: 'native', cwd },
      signal: options.signal ?? new AbortController().signal,
      runnerDirectory: join(cwd, 'runners')
    })
  }

  function processExists(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  it('passes a command that exits 0, in the root of the worktree', async () => {
    const result = await run('pwd; echo ok')
    expect(result).toEqual({
      status: 'passed',
      exitCode: 0,
      stdout: `${cwd}\nok\n`,
      stderr: '',
      outputTruncated: false,
      error: null
    })
  })

  it('fails with the exit code and keeps both streams', async () => {
    const result = await run('echo checked; echo "2 problems" 1>&2; exit 3')
    expect(result).toMatchObject({
      status: 'failed',
      exitCode: 3,
      stdout: 'checked\n',
      stderr: '2 problems\n',
      error: null
    })
  })

  it('keeps the end of a long output', async () => {
    const result = await run('for i in $(seq 1 5000); do echo "line $i"; done; echo last')
    expect(result.status).toBe('passed')
    expect(result.outputTruncated).toBe(true)
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(QUALITY_GATE_OUTPUT_TAIL_BYTES)
    expect(result.stdout.endsWith('line 5000\nlast\n')).toBe(true)
    expect(result.stdout).not.toContain('line 1\n')
  })

  it('stops the whole process tree at the time limit and withholds the exit code', async () => {
    const startedAt = Date.now()
    const result = await run('sleep 30 & echo $! > child.pid; wait', { timeoutSeconds: 1 })
    expect(result).toMatchObject({ status: 'timed-out', exitCode: null })
    expect(result.error).toContain('1s time limit')
    expect(Date.now() - startedAt).toBeLessThan(15_000)
    const childPid = Number(readFileSync(join(cwd, 'child.pid'), 'utf-8').trim())
    expect(childPid).toBeGreaterThan(0)
    expect(processExists(childPid)).toBe(false)
  })

  it('reports a cancelled run as cancelled, not failed, and stops its children', async () => {
    const abort = new AbortController()
    const pending = run('sleep 30 & echo $! > child.pid; wait', { signal: abort.signal })
    await expect.poll(() => existsSync(join(cwd, 'child.pid')), { timeout: 10_000 }).toBe(true)
    abort.abort()

    const result = await pending
    expect(result).toMatchObject({ status: 'cancelled', exitCode: null, error: null })
    const childPid = Number(readFileSync(join(cwd, 'child.pid'), 'utf-8').trim())
    expect(processExists(childPid)).toBe(false)
  })

  it('does not start a command for a signal that is already aborted', async () => {
    const abort = new AbortController()
    abort.abort()
    const result = await run('echo ran > ran.txt', { signal: abort.signal })
    expect(result.status).toBe('cancelled')
    expect(existsSync(join(cwd, 'ran.txt'))).toBe(false)
  })

  it('says a command the shell cannot find was not started', async () => {
    const result = await run('orca-no-such-quality-gate-tool --check')
    expect(result).toMatchObject({ status: 'not-started', exitCode: 127 })
    expect(result.stderr).toContain('orca-no-such-quality-gate-tool')
  })

  it('says a command whose worktree is gone was not started', async () => {
    const result = await runQualityGateCommand({
      runId: 'run-1',
      command: 'echo ok',
      timeoutSeconds: 20,
      target: { kind: 'native', cwd: join(cwd, 'removed') },
      signal: new AbortController().signal,
      runnerDirectory: join(cwd, 'runners')
    })
    expect(result).toMatchObject({ status: 'not-started', exitCode: null })
    expect(result.error).toBeTruthy()
  })
})
