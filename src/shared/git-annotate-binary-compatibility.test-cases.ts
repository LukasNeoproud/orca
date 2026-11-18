import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { loadGitBlameFromExecutor } from './git-blame'
import { loadGitLineHistoryFromExecutor } from './git-line-history'

export function registerGitAnnotateBinaryCompatibilityCases(
  runGit: (
    args: string[],
    env?: NodeJS.ProcessEnv,
    stdin?: string
  ) => Promise<{ stdout: string; stderr: string }>,
  getRepoPath: () => string,
  image: boolean
): void {
  it('annotates editor text from stdin and lists the history of a block', async () => {
    const fixturePath = join(getRepoPath(), 'annotate')
    await mkdir(fixturePath)
    const fixtureCwd = image ? '/repo/annotate' : fixturePath
    const git = (args: string[], _cwd: string, stdin?: string) =>
      runGit(['-C', fixtureCwd, ...args], undefined, stdin)
    const commit = async (lines: string[], subject: string): Promise<void> => {
      await writeFile(join(fixturePath, 'notes.txt'), `${lines.join('\n')}\n`)
      await git(['add', 'notes.txt'], fixtureCwd)
      await git(['commit', '-qm', subject], fixtureCwd)
    }
    await git(['init', '-q'], fixtureCwd)
    await git(['config', 'user.name', 'Compatibility Test'], fixtureCwd)
    await git(['config', 'user.email', 'compatibility@example.invalid'], fixtureCwd)
    await commit(['one', 'two', 'three'], 'first')
    await commit(['one', 'TWO', 'three'], 'second')

    const blame = await loadGitBlameFromExecutor(git, fixtureCwd, {
      relativePath: 'notes.txt',
      contents: 'zero\none\nTWO\nthree\n'
    })
    const subjects = new Map(blame.commits.map((entry) => [entry.id, entry.subject]))
    expect(blame.status).toBe('ready')
    expect(
      blame.ranges.map((range) => [
        range.startLine,
        range.lineCount,
        range.commitId ? subjects.get(range.commitId) : null
      ])
    ).toEqual([
      [1, 1, null],
      [2, 1, 'first'],
      [3, 1, 'second'],
      [4, 1, 'first']
    ])
    await expect(
      loadGitBlameFromExecutor(git, fixtureCwd, { relativePath: 'missing.txt', contents: 'x\n' })
    ).resolves.toMatchObject({ status: 'untracked' })

    // A range ending past the file exercises the clamp, by Git itself or by the retry.
    const history = await loadGitLineHistoryFromExecutor(git, fixtureCwd, {
      relativePath: 'notes.txt',
      startLine: 2,
      endLine: 9,
      limit: 1
    })
    expect(history.status).toBe('ready')
    expect(history.items.map((item) => item.subject)).toEqual(['second'])
    expect(history.items[0]?.patch).toContain('-two\n+TWO')
    expect(history.hasMore).toBe(true)
    await expect(
      loadGitLineHistoryFromExecutor(git, fixtureCwd, {
        relativePath: 'missing.txt',
        startLine: 1,
        endLine: 1
      })
    ).resolves.toMatchObject({ status: 'untracked' })
  })
}
