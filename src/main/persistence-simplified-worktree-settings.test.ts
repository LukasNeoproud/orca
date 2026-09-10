import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStore, makeRepo, testState } from './persistence-test-harness'

beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'orca-creation-preference-'))
})
afterEach(() => {
  rmSync(testState.dir, { recursive: true, force: true })
})

describe('simplified Create worktree preference persistence', () => {
  it('persists the Orca location preset while clearing a previous custom root', () => {
    const store = createStore()
    store.addRepo(makeRepo({ worktreeBasePath: '../legacy-worktrees' }))
    store.updateRepo('r1', { worktreeBasePath: '', simplifiedWorktreeLocation: 'orca-default' })
    store.flush()
    const repo = createStore().getRepo('r1')
    expect(repo?.worktreeBasePath).toBeUndefined()
    expect(repo?.simplifiedWorktreeLocation).toBe('orca-default')
  })

  it('defaults off and persists changes in both directions without rewriting repositories', () => {
    let store = createStore()
    store.addRepo(makeRepo({ worktreeBasePath: '../legacy-worktrees' }))
    expect(store.getSettings().experimentalSimplifiedCreateWorktree).toBe(false)
    for (const enabled of [true, false]) {
      store.updateSettings({ experimentalSimplifiedCreateWorktree: enabled })
      store.flush()
      store = createStore()
      expect(store.getSettings().experimentalSimplifiedCreateWorktree).toBe(enabled)
      expect(store.getRepo('r1')?.worktreeBasePath).toBe('../legacy-worktrees')
    }
  })
})
