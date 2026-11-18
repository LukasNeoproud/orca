import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type * as AnnotateClient from '@/runtime/runtime-git-annotate-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import type { GitAnnotateFileContext } from './git-annotate-file-context'
import { probeGitAnnotateHostSupport } from './git-annotate-host-support'
import { useGitAnnotateStore } from './git-annotate-store'
import { showGitLineHistory } from './show-git-line-history'

const blame = vi.hoisted(() => vi.fn())
const lineHistory = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/runtime-git-annotate-client', async (importOriginal) => ({
  ...(await importOriginal<typeof AnnotateClient>()),
  getRuntimeGitBlame: blame,
  getRuntimeGitLineHistory: lineHistory
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

const WORKTREE_ID = 'repo-1::/tmp/bakery'

function context(overrides: Partial<GitAnnotateFileContext> = {}): GitAnnotateFileContext {
  return {
    worktreeId: WORKTREE_ID,
    relativePath: 'kitchen/bread.ts',
    hostKey: 'env:env-ssh',
    remoteHost: true,
    gitContext: {
      target: { kind: 'environment', environmentId: 'env-ssh' },
      worktreeId: WORKTREE_ID,
      worktreePath: '/tmp/bakery'
    },
    ...overrides
  }
}

function rpcFailure(code: string, message: string): RuntimeRpcCallError {
  return new RuntimeRpcCallError({ id: 'rpc-1', ok: false, error: { code, message } })
}

function unknownMethod(): RuntimeRpcCallError {
  return rpcFailure('method_not_found', 'Unknown method: git.blame')
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  blame.mockReset()
  lineHistory.mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.info).mockReset()
  useGitAnnotateStore.setState({ hostSupport: {}, lineHistoryByWorktree: {} })
})

describe('annotate against a host with an older Orca', () => {
  it('remembers that the host does not know the queries', async () => {
    blame.mockRejectedValue(unknownMethod())

    probeGitAnnotateHostSupport(context())
    await settle()

    expect(blame).toHaveBeenCalledExactlyOnceWith(context().gitContext, {
      relativePath: 'kitchen/bread.ts',
      contents: ''
    })
    expect(useGitAnnotateStore.getState().hostSupport['env:env-ssh']).toBe('unsupported')

    // The answer is remembered, so the next editor does not ask again.
    probeGitAnnotateHostSupport(context({ relativePath: 'kitchen/rolls.ts' }))
    expect(blame).toHaveBeenCalledTimes(1)
  })

  it('remembers a host that answers', async () => {
    blame.mockResolvedValue({ status: 'ready', ranges: [], commits: [], lineCount: 0 })

    probeGitAnnotateHostSupport(context())
    await settle()

    expect(useGitAnnotateStore.getState().hostSupport['env:env-ssh']).toBe('supported')
  })

  it('reads no version from any other failure and asks again next time', async () => {
    blame.mockRejectedValue(rpcFailure('timeout', 'timed out'))

    probeGitAnnotateHostSupport(context())
    await settle()
    expect(useGitAnnotateStore.getState().hostSupport).toEqual({})

    probeGitAnnotateHostSupport(context())
    expect(blame).toHaveBeenCalledTimes(2)
  })

  it('never asks this machine, which is always current', () => {
    probeGitAnnotateHostSupport(
      context({
        hostKey: 'local',
        remoteHost: false,
        gitContext: {
          target: { kind: 'local' },
          worktreeId: WORKTREE_ID,
          worktreePath: '/tmp/bakery'
        }
      })
    )

    expect(blame).not.toHaveBeenCalled()
  })

  it('turns an unknown line-history query into a disabled action, with no error shown', async () => {
    lineHistory.mockRejectedValue(unknownMethod())

    await showGitLineHistory(context(), { startLine: 4, endLine: 5 })

    const state = useGitAnnotateStore.getState()
    expect(state.hostSupport['env:env-ssh']).toBe('unsupported')
    expect(state.lineHistoryByWorktree[WORKTREE_ID]).toBeUndefined()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows any other line-history failure in the commit list', async () => {
    lineHistory.mockRejectedValue(new Error('fatal: bad revision'))

    await showGitLineHistory(context(), { startLine: 4, endLine: 5 })

    const state = useGitAnnotateStore.getState()
    expect(state.hostSupport).toEqual({})
    expect(state.lineHistoryByWorktree[WORKTREE_ID]?.state).toEqual({
      status: 'error',
      error: 'fatal: bad revision'
    })
  })
})
