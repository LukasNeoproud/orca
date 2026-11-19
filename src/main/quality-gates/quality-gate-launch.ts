import path from 'node:path'
import { isShebangLine } from '../../shared/setup-script-shebang'
import { buildWindowsRunnerScript } from '../setup-runner-script-text'

/** Where the command runs: on this host natively, or inside one of its WSL distros. */
export type QualityGateLaunchTarget =
  | { kind: 'native'; cwd: string }
  | { kind: 'wsl'; cwd: string; distro: string | null }

export type QualityGateLaunchPlan =
  | { kind: 'posix'; program: string; args: readonly string[]; cwd: string }
  | {
      kind: 'windows-runner'
      /** A `.cmd` file to write, then start with no arguments. */
      program: string
      runnerScript: string
      cwd: string
    }
  | { kind: 'wsl'; distro: string | null; cwd: string; script: string }
  /** Nothing to start: the command cannot mean what it says on this host. */
  | { kind: 'refused'; reason: string }

export const QUALITY_GATE_WINDOWS_SHEBANG_REFUSAL =
  'This gate command starts with a "#!" interpreter line, which needs a POSIX shell. ' +
  'On Windows, gate commands run through cmd.exe: write the command in cmd syntax, or call ' +
  'the interpreter yourself (for example "bash ./check.sh").'

/**
 * Decide how a gate command starts. Pure, so the Windows branch is testable anywhere.
 *
 * The command is free text. On Windows it goes into a `.cmd` file, the same form Orca's setup
 * runner uses, so the text never rides a `cmd.exe /c` command line; the process host starts the
 * file. POSIX hosts and WSL use bash, as hook scripts do.
 */
export function planQualityGateLaunch(args: {
  command: string
  runId: string
  platform: NodeJS.Platform
  target: QualityGateLaunchTarget
  /** Host directory for the Windows runner file. */
  runnerDirectory: string
}): QualityGateLaunchPlan {
  const { command, target } = args
  if (target.kind === 'wsl') {
    return { kind: 'wsl', distro: target.distro, cwd: target.cwd, script: command }
  }
  if (args.platform === 'win32') {
    // Why not the runner's own refusal: that text tells the user to change a setup-script setting.
    if (isShebangLine(command.split('\n', 1)[0] ?? '')) {
      return { kind: 'refused', reason: QUALITY_GATE_WINDOWS_SHEBANG_REFUSAL }
    }
    return {
      kind: 'windows-runner',
      program: path.win32.join(args.runnerDirectory, `quality-gate-${args.runId}.cmd`),
      runnerScript: buildWindowsRunnerScript(command),
      cwd: target.cwd
    }
  }
  return { kind: 'posix', program: '/bin/bash', args: ['-c', command], cwd: target.cwd }
}

/** Exit codes a shell uses when it could not find or execute the command it was given. */
export function isCommandNotStartedExitCode(code: number, plan: QualityGateLaunchPlan): boolean {
  return plan.kind === 'windows-runner' ? code === 9009 : code === 126 || code === 127
}
