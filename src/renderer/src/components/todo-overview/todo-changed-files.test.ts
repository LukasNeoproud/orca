import { describe, expect, it } from 'vitest'
import type { GitBranchCompareSummary } from '../../../../shared/git-diff-compare-types'
import { collectTodoChangedFiles } from './todo-changed-files'

const ready: GitBranchCompareSummary = {
  baseRef: 'origin/main',
  baseOid: 'a',
  compareRef: 'feature',
  headOid: 'b',
  mergeBase: 'a',
  changedFiles: 2,
  status: 'ready'
}

describe('collectTodoChangedFiles', () => {
  it('joins committed branch changes with uncommitted ones and names the base', () => {
    expect(
      collectTodoChangedFiles([{ path: 'b.ts', status: 'modified', area: 'unstaged' }], ready, [
        { path: 'a.ts', status: 'modified' },
        { path: 'gone.ts', status: 'deleted' }
      ])
    ).toEqual({ paths: ['a.ts', 'b.ts'], baseRef: 'origin/main' })
  })

  it('falls back to uncommitted changes while the branch compare is not ready', () => {
    expect(
      collectTodoChangedFiles(
        [{ path: 'b.ts', status: 'untracked', area: 'untracked' }],
        { ...ready, status: 'loading' },
        [{ path: 'a.ts', status: 'modified' }]
      )
    ).toEqual({ paths: ['b.ts'], baseRef: null })
    expect(collectTodoChangedFiles(undefined, undefined, undefined)).toEqual({
      paths: [],
      baseRef: null
    })
  })

  it('drops files deleted in the working tree and rows inside submodules', () => {
    expect(
      collectTodoChangedFiles(
        [
          { path: 'a.ts', status: 'deleted', area: 'unstaged' },
          { path: 'c.ts', status: 'deleted', area: 'staged' },
          { path: 'c.ts', status: 'untracked', area: 'untracked' },
          { path: 'lib/x.ts', status: 'modified', area: 'unstaged', submoduleRoot: 'lib' }
        ],
        ready,
        [{ path: 'a.ts', status: 'modified' }]
      ).paths
    ).toEqual(['c.ts'])
  })
})
