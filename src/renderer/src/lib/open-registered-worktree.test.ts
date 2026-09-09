import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openRegisteredWorktree } from './open-registered-worktree'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), known: vi.fn(), activate: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ fetchWorktrees: mocks.fetch, getKnownWorktreeById: mocks.known })
  }
}))
vi.mock('./worktree-activation', () => ({ activateAndRevealWorktree: mocks.activate }))
vi.mock('@/i18n/i18n', () => ({ translate: (_: string, fallback: string) => fallback }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetch.mockResolvedValue(true)
  mocks.activate.mockResolvedValue(undefined)
})
describe('open registered checkout', () => {
  it('refreshes and resolves hidden checkout on the explicit host while preserving filters', async () => {
    mocks.known.mockReturnValue({ id: 'r::/repo/hidden', hostId: 'ssh:box' })
    await openRegisteredWorktree('r', '/repo/hidden', 'ssh:box')
    expect(mocks.fetch).toHaveBeenCalledWith('r', {
      executionHostId: 'ssh:box',
      requireAuthoritative: true
    })
    expect(mocks.known).toHaveBeenCalledWith('r::/repo/hidden', 'ssh:box')
    expect(mocks.activate).toHaveBeenCalledWith('r::/repo/hidden', {
      executionHostId: 'ssh:box',
      revealInSidebar: false,
      clearSidebarFilters: false
    })
  })
  it('never uses a stale or different-host row after failed refresh', async () => {
    mocks.fetch.mockResolvedValue(false)
    mocks.known.mockReturnValue({ id: 'r::/repo/hidden', hostId: 'local' })
    await expect(openRegisteredWorktree('r', '/repo/hidden', 'ssh:box')).rejects.toThrow(
      'could not be loaded'
    )
    expect(mocks.known).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })
})
