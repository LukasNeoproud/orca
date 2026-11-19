/**
 * Annotate on an orcad-managed SSH host: `git.blame` and `git.lineHistory` answer from the host's
 * Git exactly what the desktop's Git answers for a clone of the same commits.
 * `ORCA_GIT_COMPAT_BINARY` adds that Git, e.g. a 2.25 baseline built in its source tree, as a
 * second local answer.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from './helpers/orca-app'
import { callEnvironment } from './helpers/paired-host-terminal'
import {
  launchManagedWorkspace,
  skipUnlessManagedDockerHost,
  withManagedHost
} from './helpers/orcad-managed-workspace'
import { quotePosixShell } from '../../src/shared/wsl-login-shell-command'
import { loadGitBlameFromExecutor, type GitBlameOptions } from '../../src/shared/git-blame'
import {
  loadGitLineHistoryFromExecutor,
  type GitLineHistoryOptions
} from '../../src/shared/git-line-history'
import { endSubprocessStdin } from '../../src/shared/subprocess-stdin-write'

skipUnlessManagedDockerHost()
test.skip(process.platform === 'win32', 'The Docker SSH host uses POSIX tooling')

const execFileAsync = promisify(execFile)
const FILE = 'kitchen/bread notes.txt'

const commitAs = (subject: string, date: string): string =>
  [
    'git -c user.name="Annotate Baker" -c user.email=baker@example.invalid',
    `commit -qam ${quotePosixShell(subject)}`,
    `--date=${quotePosixShell(date)}`
  ].join(' ')

const writeBread = (lines: string[]): string =>
  `printf '%s\\n' ${lines.map(quotePosixShell).join(' ')} > ${quotePosixShell(FILE)}`

const FIXTURE = [
  'mkdir -p kitchen',
  writeBread(['flour', 'water', 'salt']),
  `git add ${quotePosixShell(FILE)}`,
  commitAs('first loaf', '2026-01-01T10:00:00+00:00'),
  writeBread(['flour', 'WATER', 'salt', 'yeast']),
  commitAs('second loaf', '2026-01-02T10:00:00+01:00'),
  writeBread(['rye flour', 'WATER', 'salt', 'yeast']),
  commitAs('third loaf', '2026-01-03T10:00:00-05:00')
]

const BLAME_QUERIES: GitBlameOptions[] = [
  // An unsaved line above and a trailing edit: Git annotates the editor text, not the disk.
  { relativePath: FILE, contents: 'starter\nrye flour\nWATER\nsalt\nyeast\nhoney\n' },
  { relativePath: 'kitchen/missing.txt', contents: 'x\n' }
]

const HISTORY_QUERIES: GitLineHistoryOptions[] = [
  { relativePath: FILE, startLine: 1, endLine: 2 },
  // Past the end of the file, and a page smaller than the history.
  { relativePath: FILE, startLine: 2, endLine: 9, limit: 1 },
  { relativePath: 'kitchen/missing.txt', startLine: 1, endLine: 1 }
]

type LocalGit = { binary: string; env: NodeJS.ProcessEnv }

function localGits(home: string): LocalGit[] {
  const isolated = { HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: '1' }
  const gits: LocalGit[] = [
    { binary: 'git', env: { ...process.env, ...isolated, GIT_EXEC_PATH: undefined } }
  ]
  const compat = process.env.ORCA_GIT_COMPAT_BINARY
  if (compat) {
    const execPath = process.env.GIT_EXEC_PATH ?? dirname(compat)
    gits.push({ binary: compat, env: { ...process.env, ...isolated, GIT_EXEC_PATH: execPath } })
  }
  return gits
}

function runLocalGit(git: LocalGit, args: string[], cwd: string, stdin?: string) {
  const pending = execFileAsync(git.binary, args, { cwd, env: git.env, maxBuffer: 4 * 1024 * 1024 })
  if (stdin !== undefined) {
    endSubprocessStdin(pending.child.stdin, stdin)
  }
  return pending
}

async function localAnswers(git: LocalGit, clone: string): Promise<unknown[]> {
  const answers: unknown[] = []
  for (const query of BLAME_QUERIES) {
    answers.push(
      await loadGitBlameFromExecutor(
        (args, cwd, stdin) => runLocalGit(git, args, cwd, stdin),
        clone,
        query
      )
    )
  }
  for (const query of HISTORY_QUERIES) {
    answers.push(
      await loadGitLineHistoryFromExecutor((args, cwd) => runLocalGit(git, args, cwd), clone, query)
    )
  }
  return answers
}

test('blame and block history from the SSH host match the desktop Git', async (// oxlint-disable-next-line no-empty-pattern -- Owns its app launch through a restart session.
{}, testInfo) => {
  test.setTimeout(10 * 60_000)
  const scratch = await mkdtemp(join(tmpdir(), 'orca-ssh-annotate-'))
  try {
    await withManagedHost(testInfo, async (fixture) => {
      const repo = quotePosixShell(fixture.host.remoteRepoPath)
      const bundle = fixture.host.exec!(
        [
          `cd ${repo}`,
          ...FIXTURE,
          'git bundle create /tmp/orca-annotate.bundle HEAD >/dev/null 2>&1',
          'base64 -w0 /tmp/orca-annotate.bundle'
        ].join(' && ')
      )
      const remoteVersion = fixture.host.exec!('git --version').trim()
      const { page, seeded, environmentId } = await launchManagedWorkspace(fixture)

      const worktree = `id:${seeded.worktreeId}`
      const remote: unknown[] = []
      for (const query of BLAME_QUERIES) {
        remote.push(await callEnvironment(page, environmentId, 'git.blame', { worktree, ...query }))
      }
      for (const query of HISTORY_QUERIES) {
        remote.push(
          await callEnvironment(page, environmentId, 'git.lineHistory', { worktree, ...query })
        )
      }
      expect(remote[0]).toMatchObject({ status: 'ready', lineCount: 6 })
      expect(remote[1]).toMatchObject({ status: 'untracked' })
      expect(remote[3]).toMatchObject({ status: 'ready', hasMore: true })

      const bundlePath = join(scratch, 'annotate.bundle')
      await writeFile(bundlePath, Buffer.from(bundle.trim().split('\n').at(-1) ?? '', 'base64'))
      const clone = join(scratch, 'clone')
      const [systemGit] = localGits(scratch)
      await runLocalGit(systemGit, ['clone', '-q', bundlePath, clone], scratch)
      for (const git of localGits(scratch)) {
        const version = (await runLocalGit(git, ['--version'], scratch)).stdout.trim()
        await testInfo.attach(`annotate answers (${remoteVersion} host, ${version} desktop)`, {
          body: JSON.stringify(remote, null, 2),
          contentType: 'application/json'
        })
        expect(await localAnswers(git, clone), `${version} against ${remoteVersion}`).toEqual(
          remote
        )
      }
    })
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})
