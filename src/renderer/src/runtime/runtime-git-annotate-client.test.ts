import { beforeEach, describe, expect, it, vi } from 'vitest'
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
