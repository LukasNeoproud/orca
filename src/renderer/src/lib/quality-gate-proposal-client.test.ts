import { beforeEach, describe, expect, it, vi } from 'vitest'

const { callRuntimeRpc, runtimeEnvironmentSupportsCapability } = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability
}))

import {
  answerQualityGateProposal,
  fetchQualityGateProposal,
  qualityGateProposalsSupported
} from './quality-gate-proposal-client'

const remote = { kind: 'environment', environmentId: 'env-ssh' } as const
const local = { kind: 'local' } as const
const lint = { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 }
const proposal = {
  id: 'p1',
  repoId: 'repo',
  worktreeId: 'repo::/srv/app',
  proposedAt: 5,
  proposedBy: { kind: 'local-cli' },
  items: [{ id: 'item-1', name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 60 }]
}

describe('quality gate proposal client', () => {
  beforeEach(() => {
    callRuntimeRpc.mockReset()
    runtimeEnvironmentSupportsCapability.mockReset()
  })

  it('asks a remote host for the capability, and never this app', async () => {
    runtimeEnvironmentSupportsCapability.mockResolvedValue(false)

    expect(await qualityGateProposalsSupported(local)).toBe(true)
    expect(await qualityGateProposalsSupported(remote)).toBe(false)
    expect(runtimeEnvironmentSupportsCapability).toHaveBeenCalledTimes(1)
    expect(runtimeEnvironmentSupportsCapability).toHaveBeenCalledWith(
      'env-ssh',
      'quality-gates.proposals.v1',
      expect.any(Number)
    )
  })

  it('reads the pending proposal of a repository on the host that keeps it', async () => {
    callRuntimeRpc.mockResolvedValueOnce({ proposal })
    callRuntimeRpc.mockResolvedValueOnce({ proposal: null })

    expect(await fetchQualityGateProposal(remote, 'repo')).toEqual(proposal)
    expect(await fetchQualityGateProposal(local, 'repo')).toBeNull()
    expect(
      callRuntimeRpc.mock.calls.map(([target, method, params]) => [target, method, params])
    ).toEqual([
      [remote, 'qualityGates.proposal', { repo: 'id:repo' }],
      [local, 'qualityGates.proposal', { repo: 'id:repo' }]
    ])
  })

  it('reads the answer of a host of another build tolerantly', async () => {
    callRuntimeRpc.mockResolvedValue({
      proposal: {
        ...proposal,
        extra: 'dropped',
        items: [...proposal.items, { id: 'item-2', name: '', command: 'x' }]
      }
    })

    expect(await fetchQualityGateProposal(remote, 'repo')).toEqual(proposal)
  })

  it('answers by proposal id and items, and returns what the host holds afterwards', async () => {
    callRuntimeRpc.mockResolvedValue({ proposal: null, gates: [lint] })

    expect(
      await answerQualityGateProposal(remote, 'repo', {
        proposalId: 'p1',
        action: 'accept',
        itemIds: ['item-1']
      })
    ).toEqual({ proposal: null, gates: [lint] })
    await answerQualityGateProposal(local, 'repo', { proposalId: 'p1', action: 'dismiss' })

    expect(
      callRuntimeRpc.mock.calls.map(([target, method, params]) => [target, method, params])
    ).toEqual([
      [
        remote,
        'qualityGates.resolveProposal',
        { repo: 'id:repo', proposalId: 'p1', action: 'accept', itemIds: ['item-1'] }
      ],
      [
        local,
        'qualityGates.resolveProposal',
        { repo: 'id:repo', proposalId: 'p1', action: 'dismiss' }
      ]
    ])
  })

  it('takes nothing as settled when the answer names no gates', async () => {
    callRuntimeRpc.mockResolvedValue({ proposal: null })

    await expect(
      answerQualityGateProposal(remote, 'repo', { proposalId: 'p1', action: 'dismiss' })
    ).rejects.toThrow(/did not confirm/)
  })
})
