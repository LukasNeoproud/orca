import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalize, resolve } from 'node:path'

const { handleMock, resolveCliCommandMock, spawnMock, statMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  resolveCliCommandMock: vi.fn(),
  spawnMock: vi.fn(),
  statMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn(), openPath: vi.fn() },
  dialog: { showOpenDialog: vi.fn() }
}))

vi.mock('node:fs/promises', () => ({
  constants: { COPYFILE_EXCL: 1 },
  copyFile: vi.fn(),
  stat: statMock
}))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

vi.mock('../codex-cli/command', () => ({ resolveCliCommand: resolveCliCommandMock }))

vi.mock('../win32-utils', () => ({
  getCmdExePath: () => 'C:\\Windows\\System32\\cmd.exe',
  getSpawnArgsForWindows: (command: string, args: string[]) => ({
    spawnCmd: command,
    spawnArgs: args
  })
}))

import { registerShellHandlers } from './shell'

type Handler = (event: unknown, request: unknown) => Promise<unknown>

function createSpawnedProcess(): { once: unknown; off: unknown; unref: unknown } {
  const child = {
    once: vi.fn((eventName: string, callback: () => void) => {
      if (eventName === 'spawn') {
        queueMicrotask(callback)
      }
      return child
    }),
    off: vi.fn(() => child),
    unref: vi.fn()
  }
  return child
}

describe('shell:openInExternalEditor with a file location', () => {
  const sshTarget = {
    id: 'ssh-1',
    label: 'Builder',
    host: 'builder.example.com',
    port: 22,
    username: 'ada',
    source: 'ssh-config',
    configHost: 'builder'
  }
  const store = {
    getSettings: () => ({ activeRuntimeEnvironmentId: null }),
    getSshTarget: (id: string) => (id === 'ssh-1' ? sshTarget : undefined)
  }

  function getHandler(): Handler {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only getSettings and getSshTarget, both stubbed above.
    registerShellHandlers(store as never)
    const call = handleMock.mock.calls.find((c: unknown[]) => c[0] === 'shell:openInExternalEditor')
    if (!call) {
      throw new Error('shell:openInExternalEditor handler not registered')
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: registerShellHandlers registers this channel with a (event, request) handler.
    return call[1] as Handler
  }

  function spawnedArgs(): unknown {
    return spawnMock.mock.calls[0]?.[1]
  }

  beforeEach(() => {
    handleMock.mockReset()
    resolveCliCommandMock.mockReset()
    spawnMock.mockReset()
    statMock.mockReset()
    resolveCliCommandMock.mockImplementation((command: string) => command)
    spawnMock.mockImplementation(createSpawnedProcess)
    statMock.mockResolvedValue({ isDirectory: () => false })
  })

  it('passes the line and column of a local file to the editor', async () => {
    const filePath = resolve('repo', 'src', 'App.kt')

    await expect(
      getHandler()(
        {},
        { path: filePath, command: 'code', line: 42, column: 7, ownerHostId: 'local' }
      )
    ).resolves.toEqual({ ok: true })
    expect(spawnedArgs()).toEqual(['--goto', `${normalize(filePath)}:42:7`])
  })

  it('uses the line switch of a JetBrains IDE', async () => {
    const filePath = resolve('repo', 'src', 'App.kt')

    await getHandler()({}, { path: filePath, command: 'studio', line: 42, ownerHostId: 'local' })
    expect(spawnedArgs()).toEqual(['--line', '42', normalize(filePath)])
  })

  it.each([0, -3, 1.5, Number.NaN, '12'])('opens the bare file for the line %s', async (line) => {
    const filePath = resolve('repo', 'src', 'App.kt')

    await getHandler()(
      {},
      { path: filePath, command: 'code', line, column: 7, ownerHostId: 'local' }
    )
    expect(spawnedArgs()).toEqual([normalize(filePath)])
  })

  it('drops an unusable column but keeps the line', async () => {
    const filePath = resolve('repo', 'src', 'App.kt')

    await getHandler()(
      {},
      { path: filePath, command: 'code', line: 42, column: 0, ownerHostId: 'local' }
    )
    expect(spawnedArgs()).toEqual(['--goto', `${normalize(filePath)}:42`])
  })

  it('still refuses a missing local file', async () => {
    statMock.mockRejectedValue(new Error('ENOENT'))

    await expect(
      getHandler()({}, { path: resolve('repo', 'gone.kt'), line: 3, ownerHostId: 'local' })
    ).resolves.toEqual({ ok: false, reason: 'not-found' })
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('opens an SSH file at its line through VS Code Remote-SSH', async () => {
    await expect(
      getHandler()(
        {},
        {
          path: '/srv/repo/Makefile',
          command: 'code',
          line: 42,
          column: 7,
          connectionId: 'ssh-1',
          ownerHostId: 'ssh:ssh-1'
        }
      )
    ).resolves.toEqual({ ok: true })
    expect(statMock).not.toHaveBeenCalled()
    expect(spawnedArgs()).toEqual([
      '--remote',
      'ssh-remote+builder',
      '--goto',
      '/srv/repo/Makefile:42:7'
    ])
  })

  describe('with the project root', () => {
    const root = resolve('work', 'repo')
    const filePath = resolve('work', 'repo', 'src', 'App.kt')

    beforeEach(() => {
      statMock.mockImplementation(async (candidate: string) => ({
        isDirectory: () => candidate === normalize(root)
      }))
    })

    function open(request: Record<string, unknown>): Promise<unknown> {
      return getHandler()(
        {},
        { path: filePath, command: 'code', line: 42, column: 7, ownerHostId: 'local', ...request }
      )
    }

    it('opens a VS Code file in the window of the folder that holds it', async () => {
      await expect(open({ projectRoot: root })).resolves.toEqual({ ok: true })
      expect(spawnedArgs()).toEqual([normalize(root), '--goto', `${normalize(filePath)}:42:7`])
    })

    it.each([
      ['a folder the file is not in', resolve('work', 'other')],
      ['a folder that does not exist', resolve('work', 'repo', 'gone')],
      ['a relative folder', 'repo'],
      ['a root that is not a string', ['/work/repo']]
    ])('opens the bare file for %s', async (_label, projectRoot) => {
      await expect(open({ projectRoot })).resolves.toEqual({ ok: true })
      expect(spawnedArgs()).toEqual(['--goto', `${normalize(filePath)}:42:7`])
    })

    it('opens a JetBrains file in the window of the folder that holds it', async () => {
      await open({ command: 'studio', projectRoot: root })
      expect(spawnedArgs()).toEqual([
        normalize(root),
        '--line',
        '42',
        '--column',
        '6',
        normalize(filePath)
      ])
    })

    it('keeps Rider on the bare file', async () => {
      await open({ command: 'rider', projectRoot: root })
      expect(spawnedArgs()).toEqual(['--line', '42', '--column', '6', normalize(filePath)])
    })

    it('keeps a compound command on the bare file', async () => {
      await open({ command: 'code --reuse-window' })
      await open({ command: 'code --reuse-window', projectRoot: root })
      expect(spawnMock.mock.calls[1]?.[1]).toEqual(spawnedArgs())
    })

    it.each([
      ['code', [normalize(root), normalize(filePath)]],
      ['studio', [normalize(root), normalize(filePath)]],
      ['rider', [normalize(filePath)]]
    ])('opens a file without a line through %s like one with a line', async (command, args) => {
      await open({ command, line: undefined, column: undefined, projectRoot: root })
      expect(spawnedArgs()).toEqual(args)
    })

    it('leaves the folder out when the target is a folder itself', async () => {
      const folder = resolve('work', 'repo', 'src')
      statMock.mockImplementation(async () => ({ isDirectory: () => true }))
      await getHandler()(
        {},
        { path: folder, command: 'code', ownerHostId: 'local', projectRoot: root }
      )
      expect(spawnedArgs()).toEqual([normalize(folder)])
    })

    it('leaves the folder out of an SSH launch', async () => {
      await expect(
        getHandler()(
          {},
          {
            path: '/srv/repo/Makefile',
            command: 'code',
            line: 42,
            column: 7,
            projectRoot: '/srv/repo',
            connectionId: 'ssh-1',
            ownerHostId: 'ssh:ssh-1'
          }
        )
      ).resolves.toEqual({ ok: true })
      expect(statMock).not.toHaveBeenCalled()
      expect(spawnedArgs()).toEqual([
        '--remote',
        'ssh-remote+builder',
        '--goto',
        '/srv/repo/Makefile:42:7'
      ])
    })
  })

  it('refuses an editor without remote support for an SSH file', async () => {
    await expect(
      getHandler()(
        {},
        {
          path: '/srv/repo/App.kt',
          command: 'studio',
          line: 42,
          connectionId: 'ssh-1',
          ownerHostId: 'ssh:ssh-1'
        }
      )
    ).resolves.toEqual({ ok: false, reason: 'remote-editor-unsupported' })
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
