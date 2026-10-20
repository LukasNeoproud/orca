import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const expandedDirs: Record<string, Set<string>> = {}
  const state = {
    activeWorktreeId: 'wt-a',
    expandedDirs,
    revealInExplorer: vi.fn()
  }
  return {
    state,
    activateAndRevealWorkspace: vi.fn(),
    createNewTerminalTab: vi.fn(),
    openFilePath: vi.fn(),
    toastInfo: vi.fn()
  }
})

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.state,
    setState: (update: (state: typeof mocks.state) => Partial<typeof mocks.state>) =>
      Object.assign(mocks.state, update(mocks.state))
  }
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: (...args: unknown[]) => mocks.activateAndRevealWorkspace(...args)
}))
vi.mock('@/components/terminal/terminal-tab-create', () => ({
  createNewTerminalTab: (...args: unknown[]) => mocks.createNewTerminalTab(...args)
}))
vi.mock('sonner', () => ({ toast: { info: (...args: unknown[]) => mocks.toastInfo(...args) } }))

import { openTerminalDirectoryLink } from './terminal-directory-link-open'

const OWNER = { worktreeId: 'wt-a', worktreePath: '/repo', canOpenWithSystemDefault: true }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.activeWorktreeId = 'wt-a'
  mocks.state.expandedDirs = {}
  vi.stubGlobal('window', { api: { shell: { openFilePath: mocks.openFilePath } } })
})

describe('openTerminalDirectoryLink', () => {
  it('reveals and expands a workspace folder in the file explorer by default', async () => {
    await openTerminalDirectoryLink('/repo/src/lib/', undefined, OWNER)

    expect(mocks.state.revealInExplorer).toHaveBeenCalledWith('wt-a', '/repo/src/lib')
    expect([...mocks.state.expandedDirs['wt-a']]).toEqual(['/repo/src/lib'])
    expect(mocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(mocks.openFilePath).not.toHaveBeenCalled()
  })

  it('switches to the owning workspace before revealing', async () => {
    mocks.state.activeWorktreeId = 'wt-b'
    await openTerminalDirectoryLink('/repo/src', undefined, OWNER)

    expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-a', {
      executionHostId: undefined
    })
    expect(mocks.state.revealInExplorer).toHaveBeenCalledWith('wt-a', '/repo/src')
  })

  it('opens a terminal in the folder, even outside the workspace', async () => {
    await openTerminalDirectoryLink('/tmp/build', 'terminal', OWNER)

    expect(mocks.createNewTerminalTab).toHaveBeenCalledWith('wt-a', undefined, {
      startupCwd: '/tmp/build'
    })
    expect(mocks.state.revealInExplorer).not.toHaveBeenCalled()
  })

  it('opens a folder outside every workspace with the OS when it is on this computer', async () => {
    await openTerminalDirectoryLink('/tmp/build', undefined, OWNER)

    expect(mocks.openFilePath).toHaveBeenCalledWith('/tmp/build', expect.anything())
    expect(mocks.state.revealInExplorer).not.toHaveBeenCalled()
  })

  it('explains instead of opening a remote folder outside the workspace', async () => {
    await openTerminalDirectoryLink('/tmp/build', undefined, {
      ...OWNER,
      canOpenWithSystemDefault: false
    })

    expect(mocks.openFilePath).not.toHaveBeenCalled()
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1)
  })
})
