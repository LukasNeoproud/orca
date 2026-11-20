// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateProposal } from '../../../../shared/quality-gate-proposal'

const mocks = vi.hoisted(() => ({
  supported: vi.fn(),
  fetch: vi.fn()
}))
vi.mock('@/lib/quality-gate-client', () => ({
  classifyQualityGateCallFailure: (error: unknown) =>
    error instanceof Error && error.message === 'runtime_timeout'
      ? 'contact-lost'
      : error instanceof Error && error.message === 'method_not_found'
        ? 'unsupported'
        : 'refused'
}))
vi.mock('@/lib/quality-gate-proposal-client', () => ({
  qualityGateProposalsSupported: mocks.supported,
  fetchQualityGateProposal: mocks.fetch
}))

import { usePendingQualityGateProposal } from './use-pending-quality-gate-proposal'

const proposal: QualityGateProposal = {
  id: 'p1',
  repoId: 'repo',
  worktreeId: 'repo::/work',
  proposedAt: 1,
  proposedBy: { kind: 'local-cli' },
  items: [{ id: 'item-1', name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 60 }]
}
const local = { id: 'repo' }
const remote = { id: 'repo', executionHostId: 'runtime:env-1' } as const

async function settle(): Promise<void> {
  await act(async () => {})
}

describe('usePendingQualityGateProposal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.supported.mockReset().mockResolvedValue(true)
    mocks.fetch.mockReset().mockResolvedValue(proposal)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('reads on open and again on an interval, since the host does not signal a proposal', async () => {
    const { result } = renderHook(() => usePendingQualityGateProposal(local, true))
    await settle()
    expect(result.current.proposal).toEqual(proposal)
    expect(mocks.fetch).toHaveBeenCalledWith({ kind: 'local' }, 'repo')

    mocks.fetch.mockResolvedValue(null)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.proposal).toBeNull()
  })

  it('asks nothing while hidden', async () => {
    const { result } = renderHook(() => usePendingQualityGateProposal(local, false))
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(mocks.supported).not.toHaveBeenCalled()
    expect(result.current.proposal).toBeNull()
  })

  it('stops asking a host that keeps no proposals', async () => {
    mocks.supported.mockResolvedValue(false)
    const { result } = renderHook(() => usePendingQualityGateProposal(remote, true))
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(mocks.supported).toHaveBeenCalledTimes(1)
    expect(mocks.supported).toHaveBeenCalledWith({ kind: 'environment', environmentId: 'env-1' })
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(result.current.proposal).toBeNull()
  })

  it('keeps what it showed while the host does not answer', async () => {
    const { result } = renderHook(() => usePendingQualityGateProposal(remote, true))
    await settle()
    mocks.fetch.mockRejectedValue(new Error('runtime_timeout'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.proposal).toEqual(proposal)
  })

  it('does not bring back an answered proposal from a read that began before the answer', async () => {
    const { result } = renderHook(() => usePendingQualityGateProposal(local, true))
    await settle()
    let finishRead: (value: QualityGateProposal) => void = () => {}
    mocks.fetch.mockReturnValue(new Promise((resolve) => (finishRead = resolve)))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    act(() => result.current.replace(null))
    await act(async () => finishRead(proposal))

    expect(result.current.proposal).toBeNull()
  })

  it('has nothing to read for a repository reached over plain SSH', async () => {
    const { result } = renderHook(() =>
      usePendingQualityGateProposal({ id: 'repo', connectionId: 'ssh-box' }, true)
    )
    await settle()

    expect(result.current.target).toBeNull()
    expect(mocks.supported).not.toHaveBeenCalled()
  })
})
