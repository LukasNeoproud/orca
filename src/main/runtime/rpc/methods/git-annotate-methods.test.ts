import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { GIT_METHODS } from './git'
import { GIT_ANNOTATE_METHODS } from './git-annotate-methods'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

function makeRuntime() {
  const commands = {
    getRuntimeId: () => 'test-runtime',
    getRuntimeGitBlame: vi.fn().mockResolvedValue({
      status: 'ready',
      ranges: [],
      commits: [],
      lineCount: 0
    }),
    getRuntimeGitLineHistory: vi.fn().mockResolvedValue({
      status: 'ready',
      items: [],
      hasMore: false,
      limit: 50
    })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the annotate methods call only the commands stubbed above.
  return { commands, runtime: commands as unknown as OrcaRuntimeService }
}

describe('git annotate RPC methods', () => {
  it('annotates the text the client sends for a file of the selected worktree', async () => {
    const { commands, runtime } = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GIT_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('git.blame', {
        worktree: 'id:wt-1',
        relativePath: 'kitchen/bread.ts',
        contents: 'flour\n'
      })
    )

    expect(commands.getRuntimeGitBlame).toHaveBeenCalledWith(
      'id:wt-1',
      'kitchen/bread.ts',
      'flour\n'
    )
    expect(response).toMatchObject({ ok: true, result: { status: 'ready' } })
  })

  it('lists the history of a block of lines', async () => {
    const { commands, runtime } = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GIT_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('git.lineHistory', {
        worktree: 'id:wt-1',
        relativePath: 'kitchen/bread.ts',
        startLine: 4,
        endLine: 5
      })
    )

    expect(commands.getRuntimeGitLineHistory).toHaveBeenCalledWith(
      'id:wt-1',
      'kitchen/bread.ts',
      { startLine: 4, endLine: 5 },
      undefined
    )
    expect(response).toMatchObject({ ok: true, result: { limit: 50 } })
  })

  it('rejects a history without a file, a line below 1 or a limit above the cap', async () => {
    const { commands, runtime } = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: GIT_METHODS })
    const base = { worktree: 'id:wt-1', relativePath: 'kitchen/bread.ts', startLine: 4, endLine: 5 }

    for (const params of [
      { ...base, relativePath: '' },
      { ...base, startLine: 0 },
      { ...base, limit: 201 }
    ]) {
      const response = await dispatcher.dispatch(makeRequest('git.lineHistory', params))
      expect(response.ok).toBe(false)
    }
    expect(commands.getRuntimeGitLineHistory).not.toHaveBeenCalled()
  })

  it('is what a host without these methods answers as unknown', async () => {
    const { runtime } = makeRuntime()
    const annotateNames = new Set<string>(GIT_ANNOTATE_METHODS.map((method) => method.name))
    const olderHost = new RpcDispatcher({
      runtime,
      methods: GIT_METHODS.filter((method) => !annotateNames.has(method.name))
    })

    const response = await olderHost.dispatch(
      makeRequest('git.blame', { worktree: 'id:wt-1', relativePath: 'bread.ts', contents: '' })
    )

    expect(response).toMatchObject({ ok: false, error: { code: 'method_not_found' } })
  })
})
