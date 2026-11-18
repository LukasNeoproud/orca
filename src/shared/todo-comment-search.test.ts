import { describe, expect, it } from 'vitest'
import type { SearchFileResult, SearchResult } from './code-search-types'
import {
  buildChangedFilesIncludePattern,
  TODO_OVERVIEW_MAX_RESULTS,
  toTodoOverviewResult
} from './todo-comment-search'

function file(relativePath: string, lines: string[]): SearchFileResult {
  return {
    filePath: `/repo/${relativePath}`,
    relativePath,
    matches: lines.map((lineContent, index) => ({
      line: index + 1,
      column: 1,
      matchLength: lineContent.search(/(TODO|FIXME)/) + 4,
      lineContent
    }))
  }
}

function result(files: SearchFileResult[], truncated = false): SearchResult {
  return {
    files,
    totalMatches: files.reduce((sum, f) => sum + f.matches.length, 0),
    truncated
  }
}

describe('toTodoOverviewResult', () => {
  it('moves the highlight and reveal range onto the marker', () => {
    const out = toTodoOverviewResult(result([file('a.kt', ['    // TODO: wire retry'])]), null)
    const match = out.files[0].matches[0]
    expect(match.lineContent.slice(match.column - 1, match.column - 1 + match.matchLength)).toBe(
      'TODO'
    )
    expect(match.displayColumn).toBe(match.column)
    expect(match.displayMatchLength).toBe(4)
  })

  it('keeps a FIXME after a block comment opener', () => {
    const input = file('b.swift', ['/* FIXME crash */'])
    input.matches[0].matchLength = 8
    const match = toTodoOverviewResult(result([input]), null).files[0].matches[0]
    expect(match).toMatchObject({ column: 4, matchLength: 5 })
  })

  it('keeps only the named files, accepting backslash paths from Windows hosts', () => {
    const out = toTodoOverviewResult(
      result([file('src\\a.ts', ['// TODO a']), file('src/b.ts', ['// TODO b'])]),
      new Set(['src/a.ts'])
    )
    expect(out.files.map((f) => f.relativePath)).toEqual(['src\\a.ts'])
    expect(out.totalMatches).toBe(1)
    expect(out.truncated).toBe(false)
  })

  it('caps the list itself and reports it when an older host ignored the limit', () => {
    const many = Array.from({ length: TODO_OVERVIEW_MAX_RESULTS + 5 }, (_, i) => `// TODO ${i}`)
    const out = toTodoOverviewResult(
      result([file('big.ts', many), file('next.ts', ['# TODO'])]),
      null
    )
    expect(out.totalMatches).toBe(TODO_OVERVIEW_MAX_RESULTS)
    expect(out.files).toHaveLength(1)
    expect(out.files[0].matchCount).toBe(TODO_OVERVIEW_MAX_RESULTS)
    expect(out.truncated).toBe(true)
  })

  it('passes on the host truncation flag', () => {
    expect(toTodoOverviewResult(result([], true), null).truncated).toBe(true)
  })
})

describe('buildChangedFilesIncludePattern', () => {
  const always = (): boolean => true

  it('anchors every path at the workspace root', () => {
    expect(buildChangedFilesIncludePattern(['README.md', 'app/src/Main.kt'], always)).toBe(
      '/README.md,/app/src/Main.kt'
    )
  })

  it('gives up when a path needs glob escaping', () => {
    expect(buildChangedFilesIncludePattern(['a/[id].ts'], always)).toBeNull()
    expect(buildChangedFilesIncludePattern(['a,b.ts'], always)).toBeNull()
  })

  it('gives up when the pattern is over the request limit', () => {
    expect(buildChangedFilesIncludePattern(['a.ts'], () => false)).toBeNull()
  })

  it('has nothing to name for an empty list', () => {
    expect(buildChangedFilesIncludePattern([], always)).toBeNull()
  })
})
