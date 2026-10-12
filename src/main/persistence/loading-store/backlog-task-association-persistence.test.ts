import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BacklogTaskAssociation } from '../../../shared/backlog-task-association'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

const { Store } = await import('./store')
const { ProfileStateSqliteAuthority } =
  await import('../profile-state/profile-state-sqlite-authority')
const PROFILE_ID = 'backlog-association-test'
const stores: InstanceType<typeof Store>[] = []
const directories: string[] = []

afterEach(async () => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
    await store.flushAsync()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function openStore(directory: string) {
  const authority = new ProfileStateSqliteAuthority(join(directory, 'profile-state.db'), PROFILE_ID)
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  const store = new Store({
    dataFile: join(directory, 'orca-data.json'),
    profileStateAuthority: authority
  })
  stores.push(store)
  return store
}

const association: BacklogTaskAssociation = {
  projectId: 'repo:repo-a',
  executionHostId: 'local',
  taskId: 'TASK-7',
  sourceWorkspace: { workspaceId: 'repo-a::/source', kind: 'git-worktree' },
  targetWorkspace: { workspaceId: 'repo-a::/target', kind: 'git-worktree' },
  session: {
    title: 'Investigate parser regression',
    agent: 'codex',
    structuredSessionId: 'session-1',
    providerSession: { key: 'session_id', id: 'provider-1' },
    history: { filePath: '/history/session.jsonl', codexHome: '/codex', cwd: '/target' }
  },
  terminal: { tabId: 'tab-1', paneKey: 'pane-1', ptyId: 'pty-1', launchAgent: 'codex' },
  attemptId: 'attempt-1',
  deliveryStatus: 'unverified',
  createdAt: 10,
  updatedAt: 20
}

describe('Backlog task association persistence', () => {
  it('durably round-trips runtime-owned association metadata', async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-backlog-associations-')))
    directories.push(directory)
    const writer = openStore(directory)
    writer.persistBacklogTaskAssociations([association])
    writer.flushOrThrow()

    expect(openStore(directory).getBacklogTaskAssociations()).toEqual([association])
  })
})
