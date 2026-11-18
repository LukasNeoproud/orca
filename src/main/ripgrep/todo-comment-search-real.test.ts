import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runBundledRipgrepTextSearch } from './bundled-ripgrep-text-search'
import type { SearchResult } from '../../shared/code-search-types'
import {
  buildChangedFilesIncludePattern,
  TODO_COMMENT_QUERY,
  toTodoOverviewResult
} from '../../shared/todo-comment-search'

describe('TODO overview search with the bundled ripgrep', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-todo-overview-'))
    await mkdir(join(root, 'app', 'src'), { recursive: true })
    await mkdir(join(root, 'other'), { recursive: true })
    await writeFile(
      join(root, 'app', 'src', 'Cart.kt'),
      [
        'class Cart {',
        '    // TODO: apply the discount',
        '    val label = "TODO"',
        '    /* FIXME rounding */',
        '     * TODO(alex): docs line',
        '    val todos = TODOS',
        '}'
      ].join('\n')
    )
    await writeFile(join(root, 'build.sh'), '# FIXME: pin the version\n')
    await writeFile(join(root, 'page.html'), '<!-- TODO hero image -->\n')
    await writeFile(join(root, 'other', 'build.sh'), '# TODO not changed\n')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function search(includePattern?: string): Promise<SearchResult> {
    return runBundledRipgrepTextSearch({
      options: {
        query: TODO_COMMENT_QUERY,
        rootPath: root,
        caseSensitive: true,
        useRegex: true,
        includePattern,
        maxResults: 1000
      },
      rootPath: root,
      resultRootPath: root,
      onSpawn: () => () => {}
    })
  }

  function lines(result: SearchResult): string[] {
    return result.files
      .flatMap((f) =>
        f.matches.map(
          (m) =>
            `${f.relativePath}:${m.line}:${m.lineContent.slice(m.column - 1, m.column - 1 + m.matchLength)}`
        )
      )
      .sort()
  }

  it('finds comment markers in any comment style and skips strings and identifiers', async () => {
    const out = toTodoOverviewResult(await search(), null)
    expect(lines(out)).toEqual([
      'app/src/Cart.kt:2:TODO',
      'app/src/Cart.kt:4:FIXME',
      'app/src/Cart.kt:5:TODO',
      'build.sh:1:FIXME',
      'other/build.sh:1:TODO',
      'page.html:1:TODO'
    ])
  })

  it('limits the search to changed files anchored at the root', async () => {
    const include = buildChangedFilesIncludePattern(['build.sh', 'app/src/Cart.kt'], () => true)
    const out = toTodoOverviewResult(
      await search(include ?? undefined),
      new Set(['build.sh', 'app/src/Cart.kt'])
    )
    expect(lines(out)).toEqual([
      'app/src/Cart.kt:2:TODO',
      'app/src/Cart.kt:4:FIXME',
      'app/src/Cart.kt:5:TODO',
      'build.sh:1:FIXME'
    ])
  })
})
