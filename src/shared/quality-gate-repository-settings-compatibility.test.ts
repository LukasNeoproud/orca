import { describe, expect, it } from 'vitest'
import {
  HOST_FEATURE_RUNTIME_CAPABILITIES,
  QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY,
  QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY,
  QUALITY_GATES_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY
} from './host-feature-runtime-capabilities'
import { readQualityGateRepositorySettings } from './quality-gate-repository-settings'
import {
  QualityGateRunParams,
  QualityGateSetFeedbackLoopParams,
  QualityGateSetRepositorySettingsParams,
  QualityGateWorktreeParams
} from './rpc-contract/quality-gate-params'
import { RPC_PARAMS_BY_METHOD } from './rpc-contract/rpc-params-catalog.generated'

const lint = { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 }
const loop = { enabled: true, maxRounds: 3 }

describe('repository gate settings between builds of different age', () => {
  describe('an older client with this host', () => {
    it('finds every capability and method it already had, unchanged', () => {
      for (const capability of [
        QUALITY_GATES_RUNTIME_CAPABILITY,
        QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY,
        QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY,
        QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY
      ]) {
        expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(capability)
      }
      expect(RPC_PARAMS_BY_METHOD['qualityGates.status']).toBe(QualityGateWorktreeParams)
      expect(RPC_PARAMS_BY_METHOD['qualityGates.list']).toBe(QualityGateWorktreeParams)
      expect(RPC_PARAMS_BY_METHOD['qualityGates.run']).toBe(QualityGateRunParams)
      expect(RPC_PARAMS_BY_METHOD['qualityGates.setFeedbackLoop']).toBe(
        QualityGateSetFeedbackLoopParams
      )
    })

    it('still cannot write a gate through repo.update, the only write it knows', () => {
      // An older settings window sends the whole update to repo.update for a remote repository.
      const parsed = RPC_PARAMS_BY_METHOD['repo.update'].parse({
        repo: 'id:repo',
        updates: { displayName: 'App', qualityGates: [lint], qualityGateFeedbackLoop: loop }
      })
      expect(parsed).toEqual({ repo: 'id:repo', updates: { displayName: 'App' } })
    })

    it('gets no definition into a method it calls with a workspace', () => {
      const smuggled = { worktree: 'id:repo::/work', gates: [lint], feedbackLoop: loop }
      expect(QualityGateWorktreeParams.parse(smuggled)).toEqual({ worktree: 'id:repo::/work' })
      expect(QualityGateRunParams.parse(smuggled)).toEqual({ worktree: 'id:repo::/work' })
    })
  })

  describe('this client with an older host', () => {
    // The host list of a build from before this method, as status.get reports it.
    const olderHost: readonly string[] = HOST_FEATURE_RUNTIME_CAPABILITIES.filter(
      (capability) => capability !== QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY
    )

    it('sees a capability of its own to ask for, which that host does not report', () => {
      expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(
        QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY
      )
      expect(olderHost).not.toContain(QUALITY_GATES_REPOSITORY_SETTINGS_RUNTIME_CAPABILITY)
      expect(olderHost).toContain(QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY)
    })

    it('would lose the gates without an error if it sent them to a schema that drops fields', () => {
      // Why the client asks for the capability first: this is what the older host would keep.
      expect(QualityGateWorktreeParams.safeParse({ repo: 'id:repo', gates: [lint] }).success).toBe(
        false
      )
      expect(
        RPC_PARAMS_BY_METHOD['repo.update'].parse({
          repo: 'id:repo',
          updates: { gates: [lint], feedbackLoop: loop }
        })
      ).toEqual({ repo: 'id:repo', updates: {} })
    })
  })

  describe('this client with a newer host', () => {
    it('sends a request a newer schema with more fields still reads', () => {
      const newer = QualityGateSetRepositorySettingsParams.extend({
        schedule: QualityGateSetRepositorySettingsParams.shape.feedbackLoop
      })
      expect(newer.parse({ repo: 'id:repo', gates: [lint] })).toEqual({
        repo: 'id:repo',
        gates: [lint]
      })
    })

    it('reads the reply by the fields it knows and drops the rest', () => {
      expect(
        readQualityGateRepositorySettings({
          gates: [
            { ...lint, schedule: 'nightly' },
            { id: 'future', kind: 'language-server' }
          ],
          feedbackLoop: { ...loop, strategy: 'batched' },
          writtenBy: { kind: 'paired-device' }
        })
      ).toEqual({ gates: [lint], feedbackLoop: loop })
    })

    it('reads a reply without a list of gates as not saved, and a missing loop as off', () => {
      expect(readQualityGateRepositorySettings({ repo: { id: 'repo' } })).toBeNull()
      expect(readQualityGateRepositorySettings({ gates: 'pnpm lint' })).toBeNull()
      expect(readQualityGateRepositorySettings(null)).toBeNull()
      expect(readQualityGateRepositorySettings({ gates: [lint] })).toEqual({
        gates: [lint],
        feedbackLoop: { enabled: false, maxRounds: 3 }
      })
    })
  })

  describe('a newer client with this host', () => {
    it('has its unknown fields dropped and its known ones written', () => {
      expect(
        QualityGateSetRepositorySettingsParams.parse({
          repo: 'id:repo',
          gates: [lint],
          feedbackLoop: loop,
          schedule: 'nightly',
          command: 'echo pwned'
        })
      ).toEqual({ repo: 'id:repo', gates: [lint], feedbackLoop: loop })
    })
  })
})
