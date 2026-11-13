import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  AndroidApkBuildRequest,
  AndroidApkBuildResult
} from '../../shared/android-app-run-types'
import { createAndroidApkBuildHost } from './android-apk-build-host'

const root = join('/repo', 'worktree')

function host(result: AndroidApkBuildResult | Promise<AndroidApkBuildResult>) {
  const service = {
    listVariants: vi.fn(async () => ['debug', 'release']),
    buildApk: vi.fn(async (_request: AndroidApkBuildRequest) => result),
    cancel: vi.fn()
  }
  const resolveWorkspace = vi.fn(async (selector: string) => {
    if (selector !== 'id:w') {
      throw new Error('selector_not_found')
    }
    return { worktreeId: 'w', path: root, savedVariant: 'debug' }
  })
  const buildHost = createAndroidApkBuildHost({
    service,
    resolveWorkspace,
    isAndroidProject: async () => true
  })
  return { buildHost, service }
}

describe('createAndroidApkBuildHost', () => {
  it('probes a local Android workspace and reports anything else as not buildable', async () => {
    const { buildHost } = host({ phase: 'done' })
    expect(await buildHost.probe('id:w')).toEqual({ isAndroidProject: true, savedVariant: 'debug' })
    expect(await buildHost.probe('id:remote')).toEqual({ isAndroidProject: false })
  })

  it('starts a single-ABI build and reports the APK by its workspace-relative path', async () => {
    const { buildHost, service } = host({
      phase: 'done',
      apkPath: join(root, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
      applicationId: 'com.example.app',
      sizeBytes: 42
    })

    await buildHost.start({
      runId: 'run-0001',
      worktree: 'id:w',
      variant: 'debug',
      abi: 'arm64-v8a'
    })
    await vi.waitFor(() => expect(buildHost.status('run-0001').phase).toBe('done'))

    expect(service.buildApk.mock.calls[0]![0]).toMatchObject({
      worktreeId: 'w',
      worktreePath: root,
      variant: 'debug',
      abi: 'arm64-v8a'
    })
    expect(buildHost.status('run-0001').apk).toEqual({
      relativePath: 'app/build/outputs/apk/debug/app-debug.apk',
      size: 42,
      applicationId: 'com.example.app'
    })
  })

  it('joins the running build when a start is repeated after a reconnect', async () => {
    let finish: (result: AndroidApkBuildResult) => void = () => undefined
    const { buildHost, service } = host(new Promise((resolve) => (finish = resolve)))
    const request = { runId: 'run-0001', worktree: 'id:w', variant: 'debug' }

    await buildHost.start(request)
    await buildHost.start(request)

    expect(service.buildApk).toHaveBeenCalledOnce()
    expect(buildHost.status('run-0001').phase).toBe('build')
    finish({ phase: 'failed', error: 'exit code 1' })
    await vi.waitFor(() =>
      expect(buildHost.status('run-0001')).toMatchObject({ phase: 'failed', error: 'exit code 1' })
    )
  })

  it('refuses a status for a run it never started', () => {
    expect(() => host({ phase: 'done' }).buildHost.status('nope')).toThrow(
      'android_build_run_not_found'
    )
  })
})
