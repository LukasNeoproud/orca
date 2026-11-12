import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assembleTaskName,
  findBuiltApks,
  gradleWrapperSpec,
  isGradleAndroidProject,
  parseAndroidBuildVariants
} from './gradle-android-project'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-android-project-'))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, ...path.split('/'))
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, content)
  }
  return root
}

describe('parseAndroidBuildVariants', () => {
  it('lists the variants of application modules only', () => {
    const output = [
      'Build tasks',
      'app:assemble - Assemble main outputs for all the variants.',
      'app:assembleAndroidTest - Assembles all the Test applications.',
      'app:assembleFree - Assembles main outputs for all Free variants.',
      'app:assembleFreeDebug - Assembles main output for variant freeDebug',
      'app:assembleFreeDebugAndroidTest - Assembles main output for variant freeDebugAndroidTest',
      'app:assembleFreeDebugUnitTest - Assembles main output for variant freeDebugUnitTest',
      'app:assemblePaidRelease - Assembles main output for variant paidRelease',
      'core:data:assembleDebug - Assembles main output for variant debug',
      'app:installFreeDebug - Installs the Debug build for flavor Free.',
      'app:installFreeDebugAndroidTest - Installs the android (on device) tests.',
      'app:uninstallAll - Uninstall all applications.'
    ].join('\r\n')

    expect(parseAndroidBuildVariants(output)).toEqual(['freeDebug', 'paidRelease'])
  })

  it('finds nothing in a project without an application module', () => {
    expect(
      parseAndroidBuildVariants('lib:assembleDebug - Assembles main output for variant debug')
    ).toEqual([])
  })
})

describe('assembleTaskName', () => {
  it('capitalises the variant and rejects anything that is not a task name', () => {
    expect(assembleTaskName('freeDebug')).toBe('assembleFreeDebug')
    expect(() => assembleTaskName('debug --offline')).toThrow('Invalid build variant')
    expect(() => assembleTaskName('-Pfoo')).toThrow('Invalid build variant')
  })
})

describe('gradleWrapperSpec', () => {
  it('runs the batch wrapper on Windows and the shell wrapper elsewhere', () => {
    expect(gradleWrapperSpec('/p', ['tasks'], 'win32').program).toBe(join('/p', 'gradlew.bat'))
    expect(gradleWrapperSpec('/p', ['tasks'], 'darwin')).toEqual({
      program: '/bin/sh',
      args: [join('/p', 'gradlew'), 'tasks'],
      cwd: '/p'
    })
  })
})

describe('isGradleAndroidProject', () => {
  it('needs a wrapper, a settings file and a module with an Android manifest', async () => {
    const android = await project({
      gradlew: '',
      'settings.gradle.kts': '',
      'app/src/main/AndroidManifest.xml': '<manifest/>'
    })
    const plainGradle = await project({
      gradlew: '',
      'settings.gradle': '',
      'lib/build.gradle': ''
    })
    const noWrapper = await project({
      'settings.gradle': '',
      'app/src/main/AndroidManifest.xml': '<manifest/>'
    })

    expect(await isGradleAndroidProject(android)).toBe(true)
    expect(await isGradleAndroidProject(plainGradle)).toBe(false)
    expect(await isGradleAndroidProject(noWrapper)).toBe(false)
  })
})

describe('findBuiltApks', () => {
  it('returns the universal APK of the requested variant', async () => {
    const metadata = (variantName: string): string =>
      JSON.stringify({
        applicationId: `com.example.${variantName}`,
        variantName,
        elements: [
          { outputFile: 'app-arm64.apk', filters: [{ filterType: 'ABI', value: 'arm64-v8a' }] },
          { outputFile: 'app-universal.apk', filters: [] }
        ]
      })
    const root = await project({
      'app/build/outputs/apk/free/debug/output-metadata.json': metadata('freeDebug'),
      'app/build/outputs/apk/paid/debug/output-metadata.json': metadata('paidDebug'),
      'app/build/intermediates/apk/free/debug/output-metadata.json': metadata('freeDebug')
    })

    expect(await findBuiltApks(root, 'freeDebug')).toEqual([
      {
        apkPath: join(root, 'app', 'build', 'outputs', 'apk', 'free', 'debug', 'app-universal.apk'),
        applicationId: 'com.example.freeDebug'
      }
    ])
  })
})
