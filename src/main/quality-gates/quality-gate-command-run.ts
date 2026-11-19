import { mkdir, rm, writeFile } from 'node:fs/promises'
import { win32 } from 'node:path'
import { runProcess } from '@orca/process-host'
import { errorMessage } from '../../shared/error-message'
import { QUALITY_GATE_OUTPUT_TAIL_BYTES } from '../../shared/quality-gate-types'
import { promptGuardShellEnv } from '../git/runner'
import { dropIncoherentCondaActivationEnv } from '../pty/conda-activation-env'
import { runWslProcess } from '../wsl/wsl-runner'
import {
  isCommandNotStartedExitCode,
  planQualityGateLaunch,
  type QualityGateLaunchPlan,
  type QualityGateLaunchTarget
} from './quality-gate-launch'

export type QualityGateCommandResult = {
  status: 'passed' | 'failed' | 'timed-out' | 'not-started' | 'cancelled'
  /** Withheld for a run Orca stopped: the exit code of a killed command proves nothing. */
  exitCode: number | null
  stdout: string
  stderr: string
  outputTruncated: boolean
  error: string | null
}

type RawResult = {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  outputTruncated?: boolean
}

function nativeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  dropIncoherentCondaActivationEnv(env)
  // Unattended, like hook scripts: a credential prompt would sit there until the time limit.
  return promptGuardShellEnv(env)
}

/** Only the guard flags cross into the guest; the rest of the host environment stays out. */
function wslGuestEnv(): Record<string, string> {
  const guest: Record<string, string> = {}
  for (const [key, value] of Object.entries(promptGuardShellEnv({}))) {
    if (
      value !== undefined &&
      (key === 'GIT_TERMINAL_PROMPT' || key === 'GCM_INTERACTIVE' || key.startsWith('GIT_CONFIG_'))
    ) {
      guest[key] = value
    }
  }
  return guest
}

async function runPlan(
  plan: Exclude<QualityGateLaunchPlan, { kind: 'refused' }>,
  timeoutMs: number,
  signal: AbortSignal
): Promise<RawResult> {
  if (plan.kind === 'wsl') {
    return runWslProcess({
      distro: plan.distro ?? undefined,
      loginPath: 'preferred',
      script: plan.script,
      // Same interpreter as the native path, so one command means one thing on both.
      shell: 'bash',
      cwd: plan.cwd,
      env: wslGuestEnv(),
      timeoutMs,
      maxOutputBytes: QUALITY_GATE_OUTPUT_TAIL_BYTES,
      signal,
      outputCapture: 'tail'
    })
  }
  if (plan.kind === 'windows-runner') {
    await mkdir(win32.dirname(plan.program), { recursive: true })
    await writeFile(plan.program, plan.runnerScript, 'utf-8')
  }
  try {
    return await runProcess(
      {
        program: plan.program,
        args: plan.kind === 'posix' ? plan.args : [],
        cwd: plan.cwd,
        env: nativeEnv(),
        timeoutMs,
        maxOutputBytes: QUALITY_GATE_OUTPUT_TAIL_BYTES,
        signal,
        // Builds and test runners fork; stopping only the shell would leave them running.
        terminationBarrier: true
      },
      'tail'
    )
  } finally {
    if (plan.kind === 'windows-runner') {
      await rm(plan.program, { force: true }).catch(() => {})
    }
  }
}

/**
 * Run one gate command to its end, its time limit, or a cancel. Never rejects: a command that
 * could not start is a result too.
 */
export async function runQualityGateCommand(args: {
  runId: string
  command: string
  timeoutSeconds: number
  target: QualityGateLaunchTarget
  signal: AbortSignal
  runnerDirectory: string
  platform?: NodeJS.Platform
}): Promise<QualityGateCommandResult> {
  const plan = planQualityGateLaunch({
    command: args.command,
    runId: args.runId,
    platform: args.platform ?? process.platform,
    target: args.target,
    runnerDirectory: args.runnerDirectory
  })
  const empty = { exitCode: null, stdout: '', stderr: '', outputTruncated: false }
  if (args.signal.aborted) {
    return { ...empty, status: 'cancelled', error: null }
  }
  if (plan.kind === 'refused') {
    return { ...empty, status: 'not-started', error: plan.reason }
  }
  let raw: RawResult
  try {
    raw = await runPlan(plan, args.timeoutSeconds * 1000, args.signal)
  } catch (error) {
    return { ...empty, status: 'not-started', error: errorMessage(error) }
  }
  const output = {
    stdout: raw.stdout,
    stderr: raw.stderr,
    outputTruncated: raw.outputTruncated === true
  }
  if (raw.timedOut) {
    return {
      ...output,
      status: 'timed-out',
      exitCode: null,
      error: `Stopped after the ${args.timeoutSeconds}s time limit.`
    }
  }
  if (args.signal.aborted) {
    return { ...output, status: 'cancelled', exitCode: null, error: null }
  }
  if (raw.code === 0) {
    return { ...output, status: 'passed', exitCode: 0, error: null }
  }
  if (raw.code === null) {
    return {
      ...output,
      status: 'failed',
      exitCode: null,
      error: 'The command was terminated without reporting an exit code.'
    }
  }
  return isCommandNotStartedExitCode(raw.code, plan)
    ? {
        ...output,
        status: 'not-started',
        exitCode: raw.code,
        error: 'The shell could not find or execute the command.'
      }
    : { ...output, status: 'failed', exitCode: raw.code, error: null }
}
