import type * as NodeFsPromises from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runProcessMock = vi.hoisted(() => vi.fn())
const files = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn(), rm: vi.fn() }))
vi.mock('@orca/process-host', () => ({ runProcess: runProcessMock }))
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFsPromises>()),
  ...files
}))
vi.mock('../wsl/wsl-executable-path', () => ({
  resolveWslExecutablePath: () => 'C:\\Windows\\System32\\wsl.exe'
}))

import {
  invalidateWslGuestEnvironment,
  seedWslGuestEnvironmentForTests
} from '../wsl/wsl-guest-environment'
import { runQualityGateCommand } from './quality-gate-command-run'
import { QUALITY_GATE_WINDOWS_SHEBANG_REFUSAL } from './quality-gate-launch'

const RUNNER_DIRECTORY = 'C:\\Users\\dev\\AppData\\orca\\gates'
const RUNNER_FILE = `${RUNNER_DIRECTORY}\\quality-gate-run-1.cmd`
const EXITED = { signal: null, stdout: '', stderr: '', timedOut: false }

// What Windows and WSL are handed, checked on any platform: the process host and the WSL runner
// are the repository's own, only the spawn underneath is replaced.
describe('runQualityGateCommand on Windows and in WSL', () => {
  let order: string[]

  function run(
    target: Parameters<typeof runQualityGateCommand>[0]['target'],
    command: string,
    signal = new AbortController().signal
  ) {
    return runQualityGateCommand({
      runId: 'run-1',
      command,
      timeoutSeconds: 30,
      target,
      signal,
      runnerDirectory: RUNNER_DIRECTORY,
      platform: 'win32'
    })
  }

  beforeEach(() => {
    order = []
    runProcessMock.mockReset()
    files.mkdir.mockReset().mockImplementation(async () => void order.push('mkdir'))
    files.writeFile.mockReset().mockImplementation(async () => void order.push('write'))
    files.rm.mockReset().mockImplementation(async () => void order.push('remove'))
    invalidateWslGuestEnvironment(undefined, true)
  })

  afterEach(() => {
    invalidateWslGuestEnvironment(undefined, true)
  })

  describe('a Windows worktree', () => {
    const target = { kind: 'native', cwd: 'C:\\work\\app' } as const

    it('writes the command into a runner file, starts the file and removes it', async () => {
      runProcessMock.mockImplementation(async () => {
        order.push('run')
        return { ...EXITED, code: 0, stdout: 'ok\r\n' }
      })
      const controller = new AbortController()
      const result = await run(target, 'echo %USERNAME% & pnpm lint', controller.signal)

      expect(order).toEqual(['mkdir', 'write', 'run', 'remove'])
      expect(files.mkdir).toHaveBeenCalledWith(RUNNER_DIRECTORY, { recursive: true })
      expect(files.writeFile).toHaveBeenCalledWith(
        RUNNER_FILE,
        expect.stringContaining('call echo %USERNAME% & pnpm lint\r\n'),
        'utf-8'
      )
      expect(files.rm).toHaveBeenCalledWith(RUNNER_FILE, { force: true })

      const [spec, capture] = runProcessMock.mock.calls[0]
      // The free text is in the file; the process host is given a program and no arguments.
      expect(spec).toMatchObject({
        program: RUNNER_FILE,
        args: [],
        cwd: 'C:\\work\\app',
        timeoutMs: 30_000,
        terminationBarrier: true
      })
      expect(spec.signal).toBe(controller.signal)
      expect(spec).not.toHaveProperty('shell')
      expect(capture).toBe('tail')
      expect(result).toMatchObject({ status: 'passed', exitCode: 0, stdout: 'ok\r\n' })
    })

    it('removes the runner file when the process could not be started, and says so', async () => {
      runProcessMock.mockRejectedValue(new Error('spawn EPERM'))
      const result = await run(target, 'pnpm lint')

      expect(order).toEqual(['mkdir', 'write', 'remove'])
      expect(result).toMatchObject({ status: 'not-started', exitCode: null, error: 'spawn EPERM' })
    })

    it('starts nothing for a "#!" command and says why in terms of gates', async () => {
      const result = await run(target, '#!/usr/bin/env bash\nset -e\npnpm lint')

      expect(runProcessMock).not.toHaveBeenCalled()
      expect(order).toEqual([])
      expect(result).toEqual({
        status: 'not-started',
        exitCode: null,
        stdout: '',
        stderr: '',
        outputTruncated: false,
        error: QUALITY_GATE_WINDOWS_SHEBANG_REFUSAL
      })
    })

    it('reads 9009 as a command cmd.exe could not find', async () => {
      runProcessMock.mockResolvedValue({ ...EXITED, code: 9009 })
      expect(await run(target, 'no-such-tool')).toMatchObject({
        status: 'not-started',
        exitCode: 9009
      })
    })
  })

  describe('a worktree inside a WSL distro', () => {
    const target = { kind: 'wsl', cwd: '/home/u/app', distro: 'Ubuntu' } as const
    const command = 'pnpm lint && echo "done"'

    beforeEach(() => {
      seedWslGuestEnvironmentForTests('Ubuntu', {
        path: '/home/u/.nvm/bin:/usr/bin',
        home: '/home/u',
        envBinary: '/usr/bin/env'
      })
    })

    it('runs the command in the guest through wsl.exe --exec, with bash, in the worktree', async () => {
      runProcessMock.mockResolvedValue({ ...EXITED, code: 2, stderr: 'boom\n' })
      const controller = new AbortController()
      const result = await run(target, command, controller.signal)

      const [spec, capture] = runProcessMock.mock.calls[0]
      expect(spec.program).toBe('C:\\Windows\\System32\\wsl.exe')
      expect(spec.args.slice(0, 3)).toEqual(['-d', 'Ubuntu', '--exec'])
      expect(spec.args).toContain('bash')
      expect(spec.args).toContain(command)
      expect(spec.args).toContain('/home/u/app')
      // The guest path is cd'd to inside the guest, never handed to Windows as a cwd.
      expect(spec.cwd).not.toBe('/home/u/app')
      expect(spec.signal).toBe(controller.signal)
      expect(capture).toBe('tail')
      // Nothing is written on the Windows side for a guest command.
      expect(order).toEqual([])
      expect(result).toMatchObject({ status: 'failed', exitCode: 2, stderr: 'boom\n' })
    })

    it('hands a "#!" command to bash in the guest, which reads the line as a comment', async () => {
      runProcessMock.mockResolvedValue({ ...EXITED, code: 0 })
      const script = '#!/usr/bin/env bash\npnpm lint'
      expect(await run(target, script)).toMatchObject({ status: 'passed' })
      expect(runProcessMock.mock.calls[0][0].args).toContain(script)
    })

    it('lets only the prompt guards cross into the guest', async () => {
      runProcessMock.mockResolvedValue({ ...EXITED, code: 0 })
      await run(target, command)

      const env: NodeJS.ProcessEnv = runProcessMock.mock.calls[0][0].env
      const crossing = (env.WSLENV ?? '').split(':').filter(Boolean)
      expect(crossing).toContain('GIT_TERMINAL_PROMPT')
      expect(
        crossing.filter(
          (key) =>
            key !== 'GIT_TERMINAL_PROMPT' &&
            key !== 'GCM_INTERACTIVE' &&
            !key.startsWith('GIT_CONFIG_') &&
            !(process.env.WSLENV ?? '').split(':').includes(key)
        )
      ).toEqual([])
    })

    const groupMarker = (spec: { args: string[] }): string =>
      /__ORCA_WSL_PROCESS_GROUP_[^=]+=/.exec(spec.args.join('\n'))?.[0] ?? ''

    it('stops the process group of the command in the guest, not only wsl.exe', async () => {
      runProcessMock.mockResolvedValue({ ...EXITED, code: 0 })
      await run(target, command)

      const [spec] = runProcessMock.mock.calls[0]
      // The command starts in a session of its own, which reports its group on stderr.
      expect(spec.args.slice(3, 5)).toEqual(['sh', '-c'])
      expect(spec.args[5]).toContain('setsid --wait')
      expect(spec.args).toContain(command)
      const barrier = spec.terminationBarrier
      // Before the group is known there is nothing in the guest to signal.
      expect(await barrier.signal()).toBe(false)
      expect(runProcessMock).toHaveBeenCalledTimes(1)

      barrier.observeStderr(`${groupMarker(spec)}4321\n`)
      expect(await barrier.signal()).toBe(true)
      expect(await barrier.force()).toBe(true)

      const [term, kill] = runProcessMock.mock.calls.slice(1).map(([stop]) => stop.args)
      expect(term.slice(0, 3)).toEqual(['-d', 'Ubuntu', '--exec'])
      expect(term.join('\n')).toContain('kill -TERM "-$_orca_group"')
      expect(term.at(-1)).toBe('4321')
      expect(kill.join('\n')).toContain('kill -KILL "-$_orca_group"')
    })

    it('keeps the group report out of the stderr of the run', async () => {
      runProcessMock.mockImplementation(async (spec) => ({
        ...EXITED,
        code: 2,
        stderr: `${groupMarker(spec)}4321\nboom\n`
      }))
      expect(await run(target, command)).toMatchObject({ status: 'failed', stderr: 'boom\n' })
    })

    it('reports the time limit and a stop as what they are, without an exit code', async () => {
      runProcessMock.mockResolvedValueOnce({ ...EXITED, code: null, timedOut: true })
      expect(await run(target, command)).toMatchObject({ status: 'timed-out', exitCode: null })

      const controller = new AbortController()
      runProcessMock.mockImplementationOnce(async () => {
        controller.abort()
        return { ...EXITED, code: 137, stdout: 'partial\n' }
      })
      expect(await run(target, command, controller.signal)).toMatchObject({
        status: 'cancelled',
        exitCode: null,
        stdout: 'partial\n'
      })
    })
  })
})
