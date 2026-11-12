import { runProcess, spawnProcess } from '@orca/process-host'
import type {
  AndroidAppRunEvent,
  AndroidAppRunPhase,
  AndroidAppRunRequest,
  AndroidAppRunResult
} from '../../shared/android-app-run-types'
import {
  GRADLE_LIST_TASKS_ARGS,
  assembleTaskName,
  findBuiltApks,
  gradleWrapperSpec,
  parseAndroidBuildVariants
} from './gradle-android-project'

// A cold Gradle daemon configuring a large project takes minutes, not seconds.
const LIST_VARIANTS_TIMEOUT_MS = 10 * 60_000

export type AndroidAppRunDependencies = {
  /** Returns the adb serial, booting the AVD first when `deviceOrName` names one that is down. */
  bootDevice: (deviceOrName: string) => Promise<string>
  installApk: (serial: string, apkPath: string) => Promise<void>
  launchApp: (serial: string, applicationId: string) => Promise<void>
  /** Gradle needs the user's JAVA_HOME, which a GUI-launched app does not inherit. */
  resolveEnvironment: () => Promise<NodeJS.ProcessEnv>
  runProcess?: typeof runProcess
  spawnProcess?: typeof spawnProcess
}

class RunCancelledError extends Error {}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Builds one variant of an Android project and starts it on a device, like an IDE's Run. */
export class AndroidAppRunService {
  private readonly variantsByRoot = new Map<string, Promise<string[]>>()
  private readonly activeRuns = new Map<string, AbortController>()

  constructor(private readonly deps: AndroidAppRunDependencies) {}

  /** Cached per project root: listing costs a full Gradle configuration. */
  listVariants(root: string, options: { refresh?: boolean } = {}): Promise<string[]> {
    const cached = options.refresh ? undefined : this.variantsByRoot.get(root)
    if (cached) {
      return cached
    }
    const pending = this.loadVariants(root)
    this.variantsByRoot.set(root, pending)
    // A failed listing must not be served again from the cache.
    pending.catch(() => {
      if (this.variantsByRoot.get(root) === pending) {
        this.variantsByRoot.delete(root)
      }
    })
    return pending
  }

  private async loadVariants(root: string): Promise<string[]> {
    const result = await (this.deps.runProcess ?? runProcess)(
      {
        ...gradleWrapperSpec(root, GRADLE_LIST_TASKS_ARGS),
        env: await this.deps.resolveEnvironment(),
        timeoutMs: LIST_VARIANTS_TIMEOUT_MS
      },
      'tail'
    )
    if (result.code !== 0) {
      const reason = result.timedOut ? 'Gradle timed out' : result.stderr.trim().slice(-2000)
      throw new Error(`Could not list build variants: ${reason || `exit code ${result.code}`}`)
    }
    return parseAndroidBuildVariants(result.stdout)
  }

  cancel(runId: string): void {
    this.activeRuns.get(runId)?.abort()
  }

  async run(
    request: AndroidAppRunRequest,
    emit: (event: AndroidAppRunEvent) => void
  ): Promise<AndroidAppRunResult> {
    const { runId, worktreePath: root, variant } = request
    const controller = new AbortController()
    this.activeRuns.set(runId, controller)
    const phase = (name: AndroidAppRunPhase, detail?: string): void => {
      if (controller.signal.aborted && name !== 'cancelled') {
        throw new RunCancelledError()
      }
      emit({ runId, kind: 'phase', phase: name, ...(detail ? { detail } : {}) })
    }
    const result: AndroidAppRunResult = { phase: 'failed' }
    try {
      const task = assembleTaskName(variant)
      phase('boot', request.device)
      // Boot and build overlap, as both are slow and independent.
      const booting = this.deps.bootDevice(request.device)
      booting.catch(() => undefined)
      phase('build', task)
      await this.runGradle(root, [task, '--console=plain'], controller.signal, (text) =>
        emit({ runId, kind: 'output', text })
      )
      const apks = await findBuiltApks(root, variant)
      const apk = apks[0]
      if (!apk) {
        throw new Error(`The build produced no APK for variant "${variant}".`)
      }
      result.applicationId = apk.applicationId
      phase('boot', request.device)
      result.serial = await booting
      phase('install', apk.apkPath)
      await this.deps.installApk(result.serial, apk.apkPath)
      phase('launch', apk.applicationId)
      await this.deps.launchApp(result.serial, apk.applicationId)
      result.phase = 'done'
      phase('done')
    } catch (error) {
      if (error instanceof RunCancelledError || controller.signal.aborted) {
        result.phase = 'cancelled'
        phase('cancelled')
      } else {
        result.error = errorMessage(error)
        emit({ runId, kind: 'phase', phase: 'failed', detail: result.error })
      }
    } finally {
      this.activeRuns.delete(runId)
    }
    return result
  }

  private async runGradle(
    root: string,
    args: readonly string[],
    signal: AbortSignal,
    onOutput: (text: string) => void
  ): Promise<void> {
    const env = await this.deps.resolveEnvironment()
    await new Promise<void>((resolve, reject) => {
      const child = (this.deps.spawnProcess ?? spawnProcess)({
        ...gradleWrapperSpec(root, args),
        env,
        stdio: 'pipe'
      })
      // Killing the client disconnects it from the daemon, which cancels the build there.
      const abort = (): void => void child.kill()
      signal.addEventListener('abort', abort, { once: true })
      child.stdin.end()
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8')
        stream.on('data', onOutput)
        stream.on('error', () => undefined)
      }
      child.once('error', (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      })
      child.once('close', (code) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) {
          reject(new RunCancelledError())
        } else if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Gradle build failed (exit code ${code}). See the build output.`))
        }
      })
    })
  }
}
