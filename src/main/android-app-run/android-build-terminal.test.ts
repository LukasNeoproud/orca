import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  androidBuildRunnerScript,
  createAndroidBuildTerminalRunner,
  type AndroidBuildTerminalHost
} from './android-build-terminal'

function host(overrides: Partial<AndroidBuildTerminalHost> = {}): AndroidBuildTerminalHost {
  return {
    createTerminal: vi.fn(async () => ({
      handle: 'term-1',
      tabId: 'tab-1',
      worktreeId: 'w',
      title: 'Run app'
    })),
    waitForSetupTerminalCompletion: vi.fn(async () => ({ exitCode: 0 })),
    sendTerminal: vi.fn(async () => undefined),
    closeTerminalTab: vi.fn(async () => undefined),
    ...overrides
  }
}

const build = (signal = new AbortController().signal) => ({
  runId: 'r',
  worktreeId: 'w',
  root: "/repo/.claude/worktrees/it's here",
  gradleArgs: ['assembleDebug'],
  signal,
  onTerminal: vi.fn()
})

describe('androidBuildRunnerScript', () => {
  it('quotes the project path for a POSIX shell', () => {
    const script = androidBuildRunnerScript("/repo/it's here", ['assembleDebug'], 'darwin')
    expect(script.fileName).toBe('run-android-build.sh')
    expect(script.content).toContain(`cd '/repo/it'\\''s here' || exit 1`)
    expect(script.content).toContain(`exec /bin/sh ./gradlew 'assembleDebug'`)
  })

  it('writes a batch runner on Windows that reports the Gradle exit code', () => {
    const script = androidBuildRunnerScript('C:\\repo\\100%', ['assembleDebug'], 'win32')
    expect(script.fileName).toBe('run-android-build.cmd')
    expect(script.content).toContain('cd /d "C:\\repo\\100%%" || exit /b 1')
    expect(script.content).toContain('call gradlew.bat "assembleDebug"')
    expect(script.content).toContain('exit /b %ERRORLEVEL%')
  })
})

describe('createAndroidBuildTerminalRunner', () => {
  it('runs the build in a workspace tab started in the chosen worktree', async () => {
    const terminalHost = host()
    let runnerContent = ''
    vi.mocked(terminalHost.waitForSetupTerminalCompletion).mockImplementation(async () => {
      const command = vi.mocked(terminalHost.createTerminal).mock.calls[0]![1].command!
      runnerContent = await readFile(/[^' ]*run-android-build\.sh/.exec(command)![0], 'utf8')
      return { exitCode: 0 }
    })
    const run = createAndroidBuildTerminalRunner({
      getHost: () => terminalHost,
      resolveEnv: () => ({ ANDROID_HOME: '/sdk' }),
      platform: 'darwin'
    })
    const request = build()

    expect(await run(request)).toEqual({ exitCode: 0 })

    const [selector, options] = vi.mocked(terminalHost.createTerminal).mock.calls[0]!
    expect(selector).toBe('id:w')
    expect(options).toMatchObject({ title: 'Run app', cwd: request.root })
    expect(options.env).toMatchObject({ ANDROID_HOME: '/sdk' })
    expect(runnerContent).toContain('./gradlew')
    expect(request.onTerminal).toHaveBeenCalledWith('tab-1')
    // The marker token given to the command is the one the waiter looks for.
    const token = vi.mocked(terminalHost.waitForSetupTerminalCompletion).mock.calls[0]![2]
    expect(options.command).toContain(token)
  })

  it('replaces the previous build tab of the workspace', async () => {
    const terminalHost = host()
    const run = createAndroidBuildTerminalRunner({ getHost: () => terminalHost })

    await run(build())
    expect(terminalHost.closeTerminalTab).not.toHaveBeenCalled()
    await run(build())
    expect(terminalHost.closeTerminalTab).toHaveBeenCalledWith('term-1')
  })

  it('interrupts the terminal when the run is cancelled', async () => {
    const controller = new AbortController()
    let finish: (result: { exitCode: number }) => void = () => undefined
    const terminalHost = host({
      waitForSetupTerminalCompletion: vi.fn(
        () => new Promise<{ exitCode: number }>((resolve) => (finish = resolve))
      )
    })
    const run = createAndroidBuildTerminalRunner({ getHost: () => terminalHost })

    const running = run(build(controller.signal))
    await vi.waitFor(() => expect(terminalHost.waitForSetupTerminalCompletion).toHaveBeenCalled())
    controller.abort()
    expect(terminalHost.sendTerminal).toHaveBeenCalledWith(
      'term-1',
      { interrupt: true },
      { inputKind: 'driving' }
    )
    finish({ exitCode: 130 })
    expect(await running).toEqual({ exitCode: 130 })
  })

  it('declines when no terminal host is available', async () => {
    const run = createAndroidBuildTerminalRunner({ getHost: () => null })
    expect(await run(build())).toBeNull()
  })
})
