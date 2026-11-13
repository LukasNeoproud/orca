import { relative, sep } from 'node:path'
import type {
  AndroidAbi,
  AndroidApkBuildProbe,
  AndroidApkBuildStatus,
  AndroidAppRunEvent
} from '../../shared/android-app-run-types'
import type { AndroidAppRunService } from './android-app-run-service'
import { isGradleAndroidProject } from './gradle-android-project'

// Long enough for a phone that lost its connection mid-build to come back for the result.
const FINISHED_RUN_RETENTION_MS = 30 * 60_000

export type AndroidApkBuildWorkspace = {
  worktreeId: string
  /** A directory on this machine, already checked against the registered worktree roots. */
  path: string
  savedVariant?: string
}

export type AndroidApkBuildStart = {
  runId: string
  worktree: string
  variant: string
  abi?: AndroidAbi
}

/** What a paired client can ask of the Android build: the host builds, the client fetches the APK. */
export type AndroidApkBuildHost = {
  probe: (worktreeSelector: string) => Promise<AndroidApkBuildProbe>
  listVariants: (worktreeSelector: string, refresh?: boolean) => Promise<{ variants: string[] }>
  /** Returns at once; the build is followed through `status`, so a reconnect cannot start it twice. */
  start: (request: AndroidApkBuildStart) => Promise<{ runId: string }>
  status: (runId: string) => AndroidApkBuildStatus
  cancel: (runId: string) => void
}

let registered: AndroidApkBuildHost | null = null

/** Only the desktop main process registers one: the SDK and Gradle live beside it. */
export function registerAndroidApkBuildHost(host: AndroidApkBuildHost | null): void {
  registered = host
}

export function getAndroidApkBuildHost(): AndroidApkBuildHost | null {
  return registered
}

export function createAndroidApkBuildHost(options: {
  service: Pick<AndroidAppRunService, 'listVariants' | 'buildApk' | 'cancel'>
  /** Throws for a workspace that is not a local directory of this machine. */
  resolveWorkspace: (worktreeSelector: string) => Promise<AndroidApkBuildWorkspace>
  isAndroidProject?: (root: string) => Promise<boolean>
  now?: () => number
}): AndroidApkBuildHost {
  const { service, resolveWorkspace } = options
  const isAndroidProject = options.isAndroidProject ?? isGradleAndroidProject
  const now = options.now ?? Date.now
  const runs = new Map<string, { status: AndroidApkBuildStatus; finishedAt?: number }>()

  const prune = (): void => {
    for (const [runId, run] of runs) {
      if (run.finishedAt !== undefined && now() - run.finishedAt > FINISHED_RUN_RETENTION_MS) {
        runs.delete(runId)
      }
    }
  }

  return {
    probe: async (worktreeSelector) => {
      const workspace = await resolveWorkspace(worktreeSelector).catch(() => null)
      if (!workspace || !(await isAndroidProject(workspace.path))) {
        return { isAndroidProject: false }
      }
      return {
        isAndroidProject: true,
        ...(workspace.savedVariant ? { savedVariant: workspace.savedVariant } : {})
      }
    },
    listVariants: async (worktreeSelector, refresh) => {
      const workspace = await resolveWorkspace(worktreeSelector)
      return { variants: await service.listVariants(workspace.path, { refresh }) }
    },
    start: async ({ runId, worktree, variant, abi }) => {
      prune()
      if (runs.has(runId)) {
        return { runId }
      }
      const workspace = await resolveWorkspace(worktree)
      const run: { status: AndroidApkBuildStatus; finishedAt?: number } = {
        status: { phase: 'build' }
      }
      runs.set(runId, run)
      const onEvent = (event: AndroidAppRunEvent): void => {
        if (event.kind === 'terminal') {
          run.status = { ...run.status, terminalTabId: event.tabId }
        }
      }
      void service
        .buildApk(
          { runId, worktreeId: workspace.worktreeId, worktreePath: workspace.path, variant, abi },
          onEvent
        )
        .then(
          (result) => {
            run.status = {
              ...run.status,
              phase: result.phase,
              ...(result.error ? { error: result.error } : {}),
              ...(result.apkPath && result.sizeBytes !== undefined
                ? {
                    apk: {
                      // The file RPCs address workspace files by `/`-separated relative paths.
                      relativePath: relative(workspace.path, result.apkPath).split(sep).join('/'),
                      size: result.sizeBytes,
                      ...(result.applicationId ? { applicationId: result.applicationId } : {})
                    }
                  }
                : {})
            }
          },
          (error: unknown) => {
            run.status = {
              ...run.status,
              phase: 'failed',
              error: error instanceof Error ? error.message : String(error)
            }
          }
        )
        .finally(() => {
          run.finishedAt = now()
        })
      return { runId }
    },
    status: (runId) => {
      const run = runs.get(runId)
      if (!run) {
        throw new Error('android_build_run_not_found')
      }
      return run.status
    },
    cancel: (runId) => service.cancel(runId)
  }
}
