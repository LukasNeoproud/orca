import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../../persistence'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args: unknown) => unknown>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  }
}))
vi.mock('./repos-changed-notification', () => ({ notifyReposChanged: vi.fn() }))
vi.mock('../../worktree-root-preparation', () => ({ prepareLocalWorktreeRootForRepo: vi.fn() }))
vi.mock('../registered-worktree-roots-cache', () => ({ invalidateAuthorizedRootsCache: vi.fn() }))

import { registerRepoUpdateHandler } from './repo-update-handler'

describe('repos:update with the feedback loop setting', () => {
  const updateRepo = vi.fn((_id: string, updates: Record<string, unknown>) => ({
    id: 'repo',
    ...updates
  }))

  function update(updates: Record<string, unknown>): unknown {
    return handlers.get('repos:update')?.({}, { repoId: 'repo', updates })
  }

  beforeEach(() => {
    handlers.clear()
    updateRepo.mockClear()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler calls only updateRepo on the store and hands the window to a mocked notifier.
    registerRepoUpdateHandler({} as BrowserWindow, { updateRepo } as unknown as Store)
  })

  it('stores the loop the user turned on in the app window, with its round limit', () => {
    update({ qualityGateFeedbackLoop: { enabled: true, maxRounds: 5 } })
    expect(updateRepo).toHaveBeenCalledWith('repo', {
      qualityGateFeedbackLoop: { enabled: true, maxRounds: 5 }
    })
  })

  it('stores anything malformed as off and keeps the limit within bounds', () => {
    update({ qualityGateFeedbackLoop: 'on' })
    update({ qualityGateFeedbackLoop: { enabled: 'yes', maxRounds: 400 } })
    update({ qualityGateFeedbackLoop: { enabled: true, maxRounds: 0, command: 'echo pwned' } })
    expect(updateRepo.mock.calls.map(([, updates]) => updates.qualityGateFeedbackLoop)).toEqual([
      { enabled: false, maxRounds: 3 },
      { enabled: false, maxRounds: 10 },
      { enabled: true, maxRounds: 1 }
    ])
  })

  it('leaves the setting alone when an update does not name it', () => {
    update({ displayName: 'Renamed' })
    expect(updateRepo).toHaveBeenCalledWith('repo', { displayName: 'Renamed' })
  })
})
