import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AndroidAppRunEvent } from '../../shared/android-app-run-types'
import { AndroidAppRunService, type AndroidAppRunDependencies } from './android-app-run-service'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function projectWithBuiltApk(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-android-run-'))
  roots.push(root)
  const outputs = join(root, 'app', 'build', 'outputs', 'apk', 'debug')
  await mkdir(outputs, { recursive: true })
  await writeFile(
    join(outputs, 'output-metadata.json'),
    JSON.stringify({
      applicationId: 'com.example.app',
      variantName: 'debug',
      elements: [{ outputFile: 'app-debug.apk' }]
    })
  )
  return root
}

/** A Gradle stand-in whose exit the test controls. */
function fakeGradle() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null))
      return true
    })
  })
  const spawned: { program: string; args?: readonly string[] }[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the service touches only the stream and event members faked above.
  const spawnProcess = ((spec: { program: string; args?: readonly string[] }) => {
    spawned.push(spec)
    return child
  }) as unknown as NonNullable<AndroidAppRunDependencies['spawnProcess']>
  return { child, spawned, spawnProcess }
}

function service(overrides: Partial<AndroidAppRunDependencies>) {
  const deps = {
    bootDevice: vi.fn(async () => 'emulator-5554'),
    installApk: vi.fn(async () => undefined),
    launchApp: vi.fn(async () => undefined),
    resolveEnvironment: async () => ({}),
    ...overrides
  }
  return { deps, runner: new AndroidAppRunService(deps) }
}

const phases = (events: AndroidAppRunEvent[]): string[] =>
  events.flatMap((event) => (event.kind === 'phase' ? [event.phase] : []))

describe('AndroidAppRunService', () => {
  it('boots, builds the variant, installs the APK and launches the app', async () => {
    const root = await projectWithBuiltApk()
    const gradle = fakeGradle()
    const { deps, runner } = service({ spawnProcess: gradle.spawnProcess })
    const events: AndroidAppRunEvent[] = []

    const running = runner.run(
      { runId: 'r', worktreePath: root, variant: 'debug', device: 'Pixel_9' },
      (event) => events.push(event)
    )
    await vi.waitFor(() => expect(gradle.spawned).toHaveLength(1))
    gradle.child.stdout.write('BUILD SUCCESSFUL')
    await vi.waitFor(() => expect(events.some((event) => event.kind === 'output')).toBe(true))
    gradle.child.emit('close', 0)

    expect(await running).toEqual({
      phase: 'done',
      serial: 'emulator-5554',
      applicationId: 'com.example.app'
    })
    expect(gradle.spawned[0]!.args).toContain('assembleDebug')
    expect(deps.bootDevice).toHaveBeenCalledWith('Pixel_9')
    expect(deps.installApk).toHaveBeenCalledWith(
      'emulator-5554',
      join(root, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    )
    expect(deps.launchApp).toHaveBeenCalledWith('emulator-5554', 'com.example.app')
    expect(phases(events)).toEqual(['boot', 'build', 'boot', 'install', 'launch', 'done'])
  })

  it('reports a failed build without installing anything', async () => {
    const gradle = fakeGradle()
    const { deps, runner } = service({ spawnProcess: gradle.spawnProcess })
    const events: AndroidAppRunEvent[] = []

    const running = runner.run(
      { runId: 'r', worktreePath: await projectWithBuiltApk(), variant: 'debug', device: 'd' },
      (event) => events.push(event)
    )
    await vi.waitFor(() => expect(gradle.spawned).toHaveLength(1))
    gradle.child.emit('close', 1)

    expect((await running).phase).toBe('failed')
    expect(deps.installApk).not.toHaveBeenCalled()
    expect(phases(events).at(-1)).toBe('failed')
  })

  it('stops the build when the run is cancelled', async () => {
    const gradle = fakeGradle()
    const { deps, runner } = service({ spawnProcess: gradle.spawnProcess })

    const running = runner.run(
      { runId: 'r', worktreePath: await projectWithBuiltApk(), variant: 'debug', device: 'd' },
      () => undefined
    )
    await vi.waitFor(() => expect(gradle.spawned).toHaveLength(1))
    runner.cancel('r')

    expect((await running).phase).toBe('cancelled')
    expect(gradle.child.kill).toHaveBeenCalled()
    expect(deps.installApk).not.toHaveBeenCalled()
  })

  it('lists variants once per project and retries after a failure', async () => {
    const runProcess = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'no java', timedOut: false })
      .mockResolvedValue({
        code: 0,
        stdout: [
          'app:installDebug - Installs the Debug build.',
          'app:assembleDebug - Assembles main output for variant debug'
        ].join('\n'),
        stderr: '',
        timedOut: false
      })
    const { runner } = service({ runProcess })

    await expect(runner.listVariants('/p')).rejects.toThrow('no java')
    expect(await runner.listVariants('/p')).toEqual(['debug'])
    expect(await runner.listVariants('/p')).toEqual(['debug'])
    expect(runProcess).toHaveBeenCalledTimes(2)
    await runner.listVariants('/p', { refresh: true })
    expect(runProcess).toHaveBeenCalledTimes(3)
  })
})
