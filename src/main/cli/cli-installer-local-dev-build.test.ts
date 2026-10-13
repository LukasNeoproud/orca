import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => tmpdir(), getAppPath: () => tmpdir() }
}))
vi.mock('../../shared/local-dev-build', () => ({ isLocalDevBuild: () => true }))

import { CliInstaller } from './cli-installer'
import { createPackagedMacLauncher, makeFixture } from './cli-installer-test-fixtures'

describe('CliInstaller in a packaged Orca Dev build', () => {
  it.skipIf(process.platform === 'win32')(
    'registers orca-dev, never the installed Orca command',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath: await createPackagedMacLauncher(fixture.root),
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Orca Dev.app/Contents/MacOS/Orca Dev',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: undefined,
        processPathEnv: join(homePath, '.local', 'bin')
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toMatch(/\/orca-dev$/)
    }
  )
})
