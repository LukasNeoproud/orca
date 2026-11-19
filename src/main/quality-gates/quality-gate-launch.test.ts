import { buildWindowsCmdShimCommandLine } from '@orca/process-host/windows-command-line'
import { describe, expect, it } from 'vitest'
import {
  isCommandNotStartedExitCode,
  planQualityGateLaunch,
  QUALITY_GATE_WINDOWS_SHEBANG_REFUSAL
} from './quality-gate-launch'

const COMMAND = 'pnpm lint && echo "done" > out.txt'

function plan(platform: NodeJS.Platform, command = COMMAND) {
  return planQualityGateLaunch({
    command,
    runId: 'run-1',
    platform,
    target: { kind: 'native', cwd: platform === 'win32' ? 'C:\\work\\app' : '/work/app' },
    runnerDirectory: platform === 'win32' ? 'C:\\Users\\dev\\AppData\\orca\\gates' : '/data/gates'
  })
}

describe('planQualityGateLaunch', () => {
  it.each(['darwin', 'linux'] as const)('runs the command through bash on %s', (platform) => {
    expect(plan(platform)).toEqual({
      kind: 'posix',
      program: '/bin/bash',
      args: ['-c', COMMAND],
      cwd: '/work/app'
    })
  })

  it('puts the command in a .cmd runner on Windows and starts the file with no arguments', () => {
    const launch = plan('win32')
    if (launch.kind !== 'windows-runner') {
      throw new Error(`expected a runner file, got ${launch.kind}`)
    }
    expect(launch.program).toBe('C:\\Users\\dev\\AppData\\orca\\gates\\quality-gate-run-1.cmd')
    expect(launch.cwd).toBe('C:\\work\\app')
    expect(launch.runnerScript).toBe(
      [
        '@echo off',
        'setlocal EnableExtensions DisableDelayedExpansion',
        `call ${COMMAND}`,
        'if errorlevel 1 exit /b %errorlevel%',
        ''
      ].join('\r\n')
    )
  })

  it('keeps the free text off the cmd.exe command line the process host builds', () => {
    const launch = plan('win32', 'echo %USERNAME% & del /q *.tmp')
    if (launch.kind !== 'windows-runner') {
      throw new Error(`expected a runner file, got ${launch.kind}`)
    }
    const commandLine = buildWindowsCmdShimCommandLine(launch.program, [])
    expect(commandLine).toBe(
      '/d /v:off /s /c ""C:\\Users\\dev\\AppData\\orca\\gates\\quality-gate-run-1.cmd""'
    )
    expect(commandLine).not.toContain('USERNAME')
    expect(commandLine).not.toContain('del')
  })

  it('stops a multi-line Windows command at the first failing line, like the setup runner', () => {
    const launch = plan('win32', 'pnpm lint\npnpm test')
    if (launch.kind !== 'windows-runner') {
      throw new Error(`expected a runner file, got ${launch.kind}`)
    }
    expect(launch.runnerScript).toContain(
      'call pnpm lint\r\nif errorlevel 1 exit /b %errorlevel%\r\ncall pnpm test\r\n'
    )
  })

  it('refuses a "#!" command on Windows with a message about gates, not setup scripts', () => {
    for (const command of ['#!/bin/bash\npnpm lint', '#!/usr/bin/env sh\r\npnpm lint']) {
      expect(plan('win32', command)).toEqual({
        kind: 'refused',
        reason: QUALITY_GATE_WINDOWS_SHEBANG_REFUSAL
      })
    }
    expect(QUALITY_GATE_WINDOWS_SHEBANG_REFUSAL).not.toMatch(/setup|terminal shell/i)
    // A "#!" further down is cmd's problem, as in the setup runner.
    expect(plan('win32', 'pnpm lint\n#!/bin/bash').kind).toBe('windows-runner')
    // bash reads the line as a comment.
    expect(plan('linux', '#!/bin/bash\npnpm lint').kind).toBe('posix')
  })

  it.each(['win32', 'linux'] as const)(
    'hands a WSL worktree to the WSL runner whatever the host platform (%s)',
    (platform) => {
      expect(
        planQualityGateLaunch({
          command: COMMAND,
          runId: 'run-1',
          platform,
          target: { kind: 'wsl', cwd: '/home/dev/app', distro: 'Ubuntu' },
          runnerDirectory: 'C:\\gates'
        })
      ).toEqual({ kind: 'wsl', distro: 'Ubuntu', cwd: '/home/dev/app', script: COMMAND })
    }
  )
})

describe('isCommandNotStartedExitCode', () => {
  it('reads the shell codes for a command that could not be found or executed', () => {
    const posix = plan('linux')
    const windows = plan('win32')
    expect(isCommandNotStartedExitCode(127, posix)).toBe(true)
    expect(isCommandNotStartedExitCode(126, posix)).toBe(true)
    expect(isCommandNotStartedExitCode(1, posix)).toBe(false)
    expect(isCommandNotStartedExitCode(9009, windows)).toBe(true)
    expect(isCommandNotStartedExitCode(127, windows)).toBe(false)
  })
})
