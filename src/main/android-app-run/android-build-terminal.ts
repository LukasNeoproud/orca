import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeTerminalCreate } from '../../shared/runtime-terminal-contracts'
import type { TerminalInputKind } from '../../shared/terminal-input-kind'
import { buildObservedSetupCommand } from '../runtime/orchestration/setup-completion-signal'
import type { TerminalCreateOptions } from '../runtime/runtime-terminal-contracts'
import type { AndroidTerminalBuild } from './android-app-run-service'

export const ANDROID_BUILD_TERMINAL_TITLE = 'Run app'

/** The slice of the runtime a build terminal needs. */
export type AndroidBuildTerminalHost = {
  createTerminal: (
    worktreeSelector: string,
    options: TerminalCreateOptions
  ) => Promise<RuntimeTerminalCreate>
  waitForSetupTerminalCompletion: (
    handle: string,
    signal: AbortSignal | undefined,
    observedToken: string
  ) => Promise<{ exitCode: number | null }>
  sendTerminal: (
    handle: string,
    action: { interrupt: true },
    options: { inputKind: TerminalInputKind }
  ) => Promise<unknown>
  closeTerminalTab: (handle: string) => Promise<unknown>
}

function posixQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** A runner file, so no pane shell has to quote the project path or the Gradle arguments. */
export function androidBuildRunnerScript(
  root: string,
  gradleArgs: readonly string[],
  platform: NodeJS.Platform
): { fileName: string; content: string } {
  if (platform === 'win32') {
    // `%` is the only character a quoted batch argument still expands.
    const batch = (value: string): string => `"${value.replace(/%/g, '%%')}"`
    return {
      fileName: 'run-android-build.cmd',
      content: [
        '@echo off',
        `cd /d ${batch(root)} || exit /b 1`,
        `call gradlew.bat ${gradleArgs.map(batch).join(' ')}`,
        'exit /b %ERRORLEVEL%',
        ''
      ].join('\r\n')
    }
  }
  return {
    fileName: 'run-android-build.sh',
    content: [
      `cd ${posixQuote(root)} || exit 1`,
      // Why through sh: a checkout can lose the wrapper's executable bit.
      `exec /bin/sh ./gradlew ${gradleArgs.map(posixQuote).join(' ')}`,
      ''
    ].join('\n')
  }
}

/**
 * Runs Gradle in a terminal tab of the workspace, the way worktree setup scripts run:
 * the typed command reports its own exit status, so the shell and its output stay.
 */
export function createAndroidBuildTerminalRunner(options: {
  getHost: () => AndroidBuildTerminalHost | null
  /** Extra environment, e.g. the SDK location for a worktree without `local.properties`. */
  resolveEnv?: () => Record<string, string>
  platform?: NodeJS.Platform
}): (build: AndroidTerminalBuild) => Promise<{ exitCode: number | null } | null> {
  const platform = options.platform ?? process.platform
  // One build tab per workspace: a new run replaces the previous run's tab.
  const handleByWorktree = new Map<string, string>()

  return async (build) => {
    const host = options.getHost()
    if (!host) {
      return null
    }
    const directory = await mkdtemp(join(tmpdir(), 'orca-android-run-'))
    try {
      const script = androidBuildRunnerScript(build.root, build.gradleArgs, platform)
      const runnerPath = join(directory, script.fileName)
      await writeFile(runnerPath, script.content, 'utf8')
      const token = randomUUID()
      const observed = buildObservedSetupCommand(
        runnerPath,
        platform === 'win32' ? 'windows' : 'posix',
        token
      )
      const previous = handleByWorktree.get(build.worktreeId)
      if (previous) {
        await host.closeTerminalTab(previous).catch(() => undefined)
      }
      const terminal = await host.createTerminal(`id:${build.worktreeId}`, {
        title: ANDROID_BUILD_TERMINAL_TITLE,
        command: observed.command,
        cwd: build.root,
        env: { ...options.resolveEnv?.(), ...observed.env }
      })
      handleByWorktree.set(build.worktreeId, terminal.handle)
      if (terminal.tabId) {
        build.onTerminal(terminal.tabId)
      }
      // Ctrl+C reaches Gradle, whose status the typed command then reports.
      const interrupt = (): void =>
        void host
          .sendTerminal(terminal.handle, { interrupt: true }, { inputKind: 'driving' })
          .catch(() => undefined)
      build.signal.addEventListener('abort', interrupt, { once: true })
      if (build.signal.aborted) {
        interrupt()
      }
      try {
        return await host.waitForSetupTerminalCompletion(terminal.handle, undefined, token)
      } finally {
        build.signal.removeEventListener('abort', interrupt)
      }
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
