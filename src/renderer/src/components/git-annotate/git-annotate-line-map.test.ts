import { describe, expect, it } from 'vitest'
import type { GitBlameResult } from '../../../../shared/git-blame'
import { mapGitBlameToLines } from './git-annotate-line-map'

const commit = (id: string) => ({
  id,
  displayId: id.slice(0, 7),
  author: `Author ${id}`,
  timestamp: 0,
  subject: `Subject ${id}`
})

const blame: GitBlameResult = {
  status: 'ready',
  lineCount: 5,
  commits: [commit('aaa'), commit('bbb')],
  ranges: [
    { startLine: 1, lineCount: 2, commitId: 'aaa' },
    { startLine: 3, lineCount: 1, commitId: null },
    { startLine: 4, lineCount: 2, commitId: 'bbb' }
  ]
}
const snapshot = ['one', 'two', 'three', 'four', 'five', '']

function summarize(lines: ReturnType<typeof mapGitBlameToLines>): string[] {
  return lines.map((line) =>
    line === null ? '-' : `${line.commit?.id ?? 'uncommitted'}${line.groupStart ? '*' : ''}`
  )
}

describe('mapGitBlameToLines', () => {
  it('groups consecutive lines of one commit and leaves the unannotated last line empty', () => {
    expect(summarize(mapGitBlameToLines(blame, snapshot, snapshot))).toEqual([
      'aaa*',
      'aaa',
      'uncommitted*',
      'bbb*',
      'bbb',
      '-'
    ])
  })

  it('keeps commits on untouched lines and marks edited and inserted lines uncommitted', () => {
    const current = ['zero', 'one', 'two', 'three', 'FOUR', 'five', '']
    expect(summarize(mapGitBlameToLines(blame, snapshot, current))).toEqual([
      'uncommitted*',
      'aaa*',
      'aaa',
      'uncommitted*',
      'uncommitted',
      'bbb*',
      '-'
    ])
  })

  it('drops the annotation of a deleted line without shifting its neighbours', () => {
    const current = ['one', 'three', 'four', 'five', '']
    expect(summarize(mapGitBlameToLines(blame, snapshot, current))).toEqual([
      'aaa*',
      'uncommitted*',
      'bbb*',
      'bbb',
      '-'
    ])
  })

  it('reads a rewritten file as uncommitted instead of diffing it', () => {
    const big = Array.from({ length: 5000 }, (_, index) => `line ${index}`)
    const lines = mapGitBlameToLines(blame, snapshot, big)
    expect(lines).toHaveLength(5000)
    expect(lines.every((line) => line?.commit === null)).toBe(true)
  })
})
