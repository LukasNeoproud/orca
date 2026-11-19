import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseGitBlamePorcelain } from '../../../shared/git-blame'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from './runtime-compatibility-test-fixture'
import {
  getRuntimeGitBlame,
  getRuntimeGitLineHistory,
  isGitAnnotateUnsupportedHostError
} from './runtime-git-annotate-client'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const blame = vi.fn()
const lineHistory = vi.fn()
const runtimeEnvironmentCall = vi.fn()

const local = { target: { kind: 'local' }, worktreeId: 'wt-1', worktreePath: '/repo' } as const
const remote = {
  target: { kind: 'environment', environmentId: 'env-1' },
  worktreeId: 'wt-1',
  worktreePath: '/repo'
} as const

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  blame.mockReset()
  lineHistory.mockReset()
  runtimeEnvironmentCall.mockReset()
  vi.stubGlobal('window', {
    api: {
      gitAnnotate: { blame, lineHistory },
      runtimeEnvironments: {
        call: (args: RuntimeEnvironmentCallRequest) =>
          createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
      }
    }
  })
})

describe('runtime git annotate client', () => {
  it('uses local git IPC for a worktree on this machine, WSL included', async () => {
    blame.mockResolvedValue({ status: 'ready', ranges: [], commits: [], lineCount: 0 })

    await getRuntimeGitBlame(local, { relativePath: 'bread.ts', contents: 'flour\n' })
    await getRuntimeGitLineHistory(local, { relativePath: 'bread.ts', startLine: 4, endLine: 5 })

    expect(blame).toHaveBeenCalledWith({
      worktreePath: '/repo',
      connectionId: undefined,
      relativePath: 'bread.ts',
      contents: 'flour\n'
    })
    expect(lineHistory).toHaveBeenCalledWith({
      worktreePath: '/repo',
      connectionId: undefined,
      relativePath: 'bread.ts',
      startLine: 4,
      endLine: 5
    })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('asks the host that owns a remote worktree', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-1',
      ok: true,
      result: { status: 'ready', items: [], hasMore: false, limit: 50 },
      _meta: { runtimeId: 'remote-runtime' }
    })

    await getRuntimeGitLineHistory(remote, { relativePath: 'bread.ts', startLine: 4, endLine: 5 })

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: 'env-1',
        method: 'git.lineHistory',
        params: { worktree: 'id:wt-1', relativePath: 'bread.ts', startLine: 4, endLine: 5 }
      })
    )
    expect(lineHistory).not.toHaveBeenCalled()
  })

  it('checks the blame a remote host answers before the editor uses it', async () => {
    const id = 'a'.repeat(40)
    const answer = (result: unknown) =>
      runtimeEnvironmentCall.mockResolvedValueOnce({
        id: 'rpc-1',
        ok: true,
        result,
        _meta: { runtimeId: 'remote-runtime' }
      })
    const ask = () => getRuntimeGitBlame(remote, { relativePath: 'bread.ts', contents: 'flour\n' })
    const commit = { id, displayId: 'aaaaaaa', author: 'Ada', timestamp: 1, subject: 'Knead' }
    const ready = {
      status: 'ready',
      ranges: [{ startLine: 1, lineCount: 1, commitId: id }],
      commits: [commit],
      lineCount: 1
    }

    // A newer host may add fields; an answer without the optional e-mail is still whole.
    answer({ ...ready, renamedFrom: 'dough.ts', commits: [{ ...commit, signed: true }] })
    await expect(ask()).resolves.toMatchObject(ready)

    // What a host of this version builds from Git's porcelain, an uncommitted line included.
    const hosted = {
      status: 'ready',
      ...parseGitBlamePorcelain(
        [
          `${id} 1 1 1`,
          'author Ada',
          'author-mail <ada@example.invalid>',
          'author-time 1700000000',
          'summary Knead',
          '\tflour',
          `${'0'.repeat(40)} 2 2 1`,
          'author Not Committed Yet',
          '\twater'
        ].join('\n')
      )
    }
    for (const result of [hosted, { status: 'untracked', ranges: [], commits: [], lineCount: 0 }]) {
      answer(result)
      await expect(ask()).resolves.toEqual(result)
    }

    for (const forged of [
      { ...ready, commits: [{ ...commit, id: '"><img src=x onerror=alert(1)>' }] },
      { ...ready, commits: [{ ...commit, displayId: 'a`<b>' }] },
      { ...ready, ranges: 'all' },
      { status: 'ready', ranges: [] }
    ]) {
      answer(forged)
      await expect(ask()).rejects.toThrow()
    }
  })

  it('recognises a host that predates the queries by its unknown-method answer only', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-1',
      ok: false,
      error: { code: 'method_not_found', message: 'Unknown method: git.blame' },
      _meta: { runtimeId: 'remote-runtime' }
    })
    const olderHost = await getRuntimeGitBlame(remote, {
      relativePath: 'bread.ts',
      contents: ''
    }).catch((error: unknown) => error)
    expect(isGitAnnotateUnsupportedHostError(olderHost)).toBe(true)

    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-2',
      ok: false,
      error: { code: 'internal_error', message: 'fatal: not a git repository' },
      _meta: { runtimeId: 'remote-runtime' }
    })
    const gitFailure = await getRuntimeGitBlame(remote, {
      relativePath: 'bread.ts',
      contents: ''
    }).catch((error: unknown) => error)
    expect(gitFailure).toBeInstanceOf(Error)
    expect(isGitAnnotateUnsupportedHostError(gitFailure)).toBe(false)
    expect(isGitAnnotateUnsupportedHostError(new Error('git has no method_not_found flag'))).toBe(
      false
    )
  })
})
