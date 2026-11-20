import { describe, expect, it } from 'vitest'
import {
  HOST_FEATURE_RUNTIME_CAPABILITIES,
  QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY,
  QUALITY_GATES_PROPOSALS_RUNTIME_CAPABILITY,
  QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY,
  QUALITY_GATES_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY
} from './host-feature-runtime-capabilities'
import { readQualityGateProposalResult } from './quality-gate-proposal'
import { readQualityGateRepositorySettings } from './quality-gate-repository-settings'
import {
  QualityGateProposalParams,
  QualityGateProposeParams,
  QualityGateResolveProposalParams,
  QualityGateRunParams,
  QualityGateSetFeedbackLoopParams,
  QualityGateSetRepositorySettingsParams,
  QualityGateWorktreeParams
} from './rpc-contract/quality-gate-params'
import { RPC_PARAMS_BY_METHOD } from './rpc-contract/rpc-params-catalog.generated'

const worktree = 'id:repo::/work'
const proposed = { name: 'Lint', command: 'pnpm lint' }
const item = { id: 'item-1', ...proposed, required: true, timeoutSeconds: 600 }
const proposal = {
  id: 'p1',
  repoId: 'repo',
  worktreeId: 'repo::/work',
  proposedAt: 5,
  proposedBy: { kind: 'local-cli' },
  items: [item]
}

describe('proposals of quality gates between builds of different age', () => {
  describe('an older client with this host', () => {
    it('finds every capability and method it already had, unchanged', () => {
      for (const capability of [
        QUALITY_GATES_RUNTIME_CAPABILITY,
        QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY,
        QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY,
        QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY,
        QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY
      ]) {
        expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(capability)
      }
      expect(RPC_PARAMS_BY_METHOD['qualityGates.status']).toBe(QualityGateWorktreeParams)
      expect(RPC_PARAMS_BY_METHOD['qualityGates.list']).toBe(QualityGateWorktreeParams)
      expect(RPC_PARAMS_BY_METHOD['qualityGates.run']).toBe(QualityGateRunParams)
      expect(RPC_PARAMS_BY_METHOD['qualityGates.setFeedbackLoop']).toBe(
        QualityGateSetFeedbackLoopParams
      )
      expect(RPC_PARAMS_BY_METHOD['qualityGates.setRepositorySettings']).toBe(
        QualityGateSetRepositorySettingsParams
      )
    })

    it('writes settings as before: the write has no field of a proposal and its reply is the same', () => {
      // It never answers a proposal, so one stays pending on the host until a newer app does.
      expect(
        QualityGateSetRepositorySettingsParams.parse({
          repo: 'id:repo',
          gates: [{ id: 'lint', ...proposed }]
        })
      ).toEqual({ repo: 'id:repo', gates: [{ id: 'lint', ...proposed }] })
      expect(Object.keys(QualityGateSetRepositorySettingsParams.shape).sort()).toEqual([
        'feedbackLoop',
        'gates',
        'repo'
      ])
    })

    it('gets no proposal into a method it calls with a workspace', () => {
      const smuggled = { worktree, gates: [proposed], rationale: 'because' }
      expect(QualityGateWorktreeParams.parse(smuggled)).toEqual({ worktree })
      expect(QualityGateRunParams.parse(smuggled)).toEqual({ worktree })
    })
  })

  describe('this client with an older host', () => {
    // The host list of a build from before proposals, as status.get reports it.
    const olderHost: readonly string[] = HOST_FEATURE_RUNTIME_CAPABILITIES.filter(
      (capability) => capability !== QUALITY_GATES_PROPOSALS_RUNTIME_CAPABILITY
    )

    it('sees a capability of its own to ask for, which that host does not report', () => {
      expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(
        QUALITY_GATES_PROPOSALS_RUNTIME_CAPABILITY
      )
      expect(olderHost).not.toContain(QUALITY_GATES_PROPOSALS_RUNTIME_CAPABILITY)
      expect(olderHost).toContain(QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY)
    })

    it('has no older method that would take a proposal for a definition', () => {
      // Why the proposal has methods of its own: these are the only writes that host knows.
      expect(
        QualityGateSetRepositorySettingsParams.safeParse({ worktree, gates: [proposed] }).success
      ).toBe(false)
      expect(
        RPC_PARAMS_BY_METHOD['repo.update'].parse({
          repo: 'id:repo',
          updates: { gates: [proposed] }
        })
      ).toEqual({ repo: 'id:repo', updates: {} })
    })

    it('reads an answer without a proposal as nothing pending', () => {
      expect(readQualityGateProposalResult(undefined)).toBeNull()
      expect(readQualityGateProposalResult({ gates: [] })).toBeNull()
    })
  })

  describe('this client with a newer host', () => {
    it('sends requests a newer schema with more fields still reads', () => {
      const newerPropose = QualityGateProposeParams.extend({
        expiresAt: QualityGateProposeParams.shape.rationale
      })
      expect(newerPropose.parse({ worktree, gates: [proposed] })).toEqual({
        worktree,
        gates: [proposed]
      })
      const newerResolve = QualityGateResolveProposalParams.extend({
        note: QualityGateProposeParams.shape.rationale
      })
      const answer = { repo: 'id:repo', proposalId: 'p1', action: 'accept' }
      expect(newerResolve.parse(answer)).toEqual(answer)
    })

    it('reads the answer by the fields it knows and drops the rest', () => {
      expect(
        readQualityGateProposalResult({
          proposal: {
            ...proposal,
            expiresAt: 99,
            proposedBy: { kind: 'plugin', pluginId: 'x' },
            items: [
              { ...item, schedule: 'nightly' },
              { id: 'item-2', kind: 'language-server' }
            ]
          },
          gates: [],
          history: []
        })
      ).toEqual({ ...proposal, proposedBy: { kind: 'plugin' } })
    })

    it('reads the gates of an answer with the reader of the settings', () => {
      const gate = { id: 'lint', ...proposed, required: true, timeoutSeconds: 600 }
      expect(
        readQualityGateRepositorySettings({ proposal: null, gates: [gate, { id: 'future' }] })
          ?.gates
      ).toEqual([gate])
    })
  })

  describe('a newer client with this host', () => {
    it('has its unknown fields dropped from a proposal and from an answer', () => {
      expect(
        QualityGateProposeParams.parse({
          worktree,
          gates: [{ ...proposed, schedule: 'nightly', id: 'lint' }],
          accept: true
        })
      ).toEqual({ worktree, gates: [proposed] })
      expect(
        QualityGateResolveProposalParams.parse({
          repo: 'id:repo',
          proposalId: 'p1',
          action: 'dismiss',
          gates: [proposed],
          note: 'later'
        })
      ).toEqual({ repo: 'id:repo', proposalId: 'p1', action: 'dismiss' })
      expect(QualityGateProposalParams.parse({ repo: 'id:repo', worktree })).toEqual({
        repo: 'id:repo'
      })
    })

    it('is told when it sends an action this host does not know, instead of a guess', () => {
      expect(
        QualityGateResolveProposalParams.safeParse({
          repo: 'id:repo',
          proposalId: 'p1',
          action: 'accept-and-run'
        }).success
      ).toBe(false)
    })
  })
})
