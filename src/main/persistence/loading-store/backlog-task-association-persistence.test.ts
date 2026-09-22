import { mkdtempSync, realpathSync } from 'node:fs'
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
const stores: InstanceType<typeof Store>[] = []

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.flush()
  }
})

function openStore(dataFile: string) {
  const store = new Store({ dataFile })
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
  it('durably round-trips runtime-owned association metadata', () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-backlog-associations-')))
    const dataFile = join(directory, 'orca-data.json')
    openStore(dataFile).persistBacklogTaskAssociations([association])

    expect(openStore(dataFile).getBacklogTaskAssociations()).toEqual([association])
  })
})
