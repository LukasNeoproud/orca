import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  azureDevOpsReviewDepthFromChoice,
  azureDevOpsReviewDepthRunsCode,
  readAzureDevOpsReviewDepth
} from './azure-devops-review-depth-execution'
import type {
  AzureDevOpsReviewWorktreeInfo,
  AzureDevOpsReviewWorktreeResult
} from './azure-devops-review-types'
import {
  AZURE_DEVOPS_REVIEW_DEPTH_RUNTIME_CAPABILITY,
  AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY,
  HOST_FEATURE_RUNTIME_CAPABILITIES,
  QUALITY_GATES_RUNTIME_CAPABILITY
} from './host-feature-runtime-capabilities'
import { readQualityGateFeedbackLoopStatus } from './quality-gate-feedback-loop'
import {
  AzureDevOpsReviewOpenWorktreeParams,
  AzureDevOpsReviewRunAgentParams
} from './rpc-contract/azure-devops-review-params'
import { QualityGateRunParams } from './rpc-contract/quality-gate-params'
import { RPC_PARAMS_BY_METHOD } from './rpc-contract/rpc-params-catalog.generated'

/**
 * The remembered review depth between builds of different age. The build before it (commit
 * a2c71a16af) took two fields when opening a review worktree, remembered no depth and ran a gate
 * in any worktree. Its shapes are written out here so that both directions stay pinned.
 */

const pullRequestKey = 'dev.azure.com/contoso+repo+7'

/** `azureDevOpsReview.openWorktree` as the older host parsed it. */
const openWorktreeOfAnOlderHost = z.object({
  pullRequestKey: z.string().min(3).max(512),
  discardChanges: z.boolean().optional()
})

/** The loop reasons the older client had a label for; any other reason showed the state alone. */
const LOOP_REASONS_OF_AN_OLDER_CLIENT = new Set([
  'round-limit',
  'no-improvement',
  'not-deliverable',
  'user-input',
  'user-message',
  'agent-interrupted',
  'agent-gone',
  'disabled',
  'gates-inconclusive'
])

/** What the older client read of a review worktree: five fields, by name. */
function worktreeAsOlderClient(info: AzureDevOpsReviewWorktreeInfo) {
  const { worktreeId, repoId, path, pullRequestKey: key, commit } = info
  return { worktreeId, repoId, path, pullRequestKey: key, commit }
}

describe('review depth between a client and a host of different versions', () => {
  describe('an older client with this host', () => {
    it('opens a review worktree with the two fields it has always sent', () => {
      const parsed = AzureDevOpsReviewOpenWorktreeParams.parse({
        pullRequestKey,
        discardChanges: true
      })
      expect(parsed).toEqual({ pullRequestKey, discardChanges: true, depth: undefined })
    })

    it('leaves the remembered depth alone: no depth in the request is not a choice of static', () => {
      expect(AzureDevOpsReviewOpenWorktreeParams.parse({ pullRequestKey }).depth).toBeUndefined()
      expect(
        AzureDevOpsReviewOpenWorktreeParams.parse({ pullRequestKey, depth: null }).depth
      ).toBeUndefined()
    })

    it('starts gates with the request it has always sent; the host alone decides', () => {
      expect(RPC_PARAMS_BY_METHOD['qualityGates.run']).toBe(QualityGateRunParams)
      expect(Object.keys(QualityGateRunParams.shape).toSorted()).toEqual(['gateIds', 'worktree'])
    })

    it('reads the worktree this host answers with, the new field beside the ones it knows', () => {
      const answer: AzureDevOpsReviewWorktreeResult = JSON.parse(
        JSON.stringify({
          ok: true,
          created: false,
          worktree: {
            worktreeId: 'repo-1::/work/app-review',
            repoId: 'repo-1',
            path: '/work/app-review',
            pullRequestKey,
            commit: 'sha7',
            reviewDepth: 'build'
          }
        })
      )
      expect(answer.ok && worktreeAsOlderClient(answer.worktree)).toEqual({
        worktreeId: 'repo-1::/work/app-review',
        repoId: 'repo-1',
        path: '/work/app-review',
        pullRequestKey,
        commit: 'sha7'
      })
    })

    it('shows a loop the host stopped for a static review as stopped, without a reason', () => {
      const status = readQualityGateFeedbackLoopStatus({
        enabled: true,
        repoEnabled: true,
        workspaceDisabled: false,
        maxRounds: 3,
        state: 'stopped',
        round: 0,
        stopReason: 'run-refused',
        failingGateIds: []
      })
      // No new state: the reason is an open string, and an unknown one has always read as none.
      expect(status?.state).toBe('stopped')
      expect(LOOP_REASONS_OF_AN_OLDER_CLIENT.has(status?.stopReason ?? '')).toBe(false)
    })
  })

  describe('this client with an older host', () => {
    it('is not refused for sending the depth; the older host drops the field', () => {
      const parsed = openWorktreeOfAnOlderHost.safeParse({
        pullRequestKey,
        discardChanges: false,
        depth: 'build'
      })
      expect(parsed.success).toBe(true)
      expect(parsed.data).toEqual({ pullRequestKey, discardChanges: false })
    })

    it('reads a worktree without a remembered depth as one with none', () => {
      const answer: AzureDevOpsReviewWorktreeInfo = JSON.parse(
        JSON.stringify({
          worktreeId: 'repo-1::/work/app-review',
          repoId: 'repo-1',
          path: '/work/app-review',
          pullRequestKey,
          commit: 'sha7'
        })
      )
      expect(readAzureDevOpsReviewDepth(answer.reviewDepth)).toBeNull()
    })

    it('can tell such a host apart by a capability of its own', () => {
      expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(
        AZURE_DEVOPS_REVIEW_DEPTH_RUNTIME_CAPABILITY
      )
      // The capabilities older clients and hosts check are still there under their names.
      expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY)
      expect(HOST_FEATURE_RUNTIME_CAPABILITIES).toContain(QUALITY_GATES_RUNTIME_CAPABILITY)
    })
  })

  describe('a newer client with this host', () => {
    it('gets a static review for a depth this host does not know, never the earlier choice', () => {
      const parsed = AzureDevOpsReviewOpenWorktreeParams.parse({ pullRequestKey, depth: 'run-app' })
      expect(parsed.depth).toBe('static')
      expect(azureDevOpsReviewDepthFromChoice({ level: 'build' })).toBe('static')
      expect(azureDevOpsReviewDepthRunsCode(parsed.depth ?? null)).toBe(false)
    })

    it('opens the worktree although the request carries fields this host does not know', () => {
      const parsed = AzureDevOpsReviewOpenWorktreeParams.safeParse({
        pullRequestKey,
        depth: 'build',
        checks: ['lint']
      })
      expect(parsed.success).toBe(true)
      expect(parsed.data).toEqual({ pullRequestKey, depth: 'build' })
    })
  })

  it('never reads from a request who chose the depth of a review an agent is asked to start', () => {
    const parsed = AzureDevOpsReviewRunAgentParams.parse({
      kind: 'review',
      pullRequestKey,
      options: { depth: 'build' },
      depthChosenByUser: true
    })
    expect(parsed).not.toHaveProperty('depthChosenByUser')
  })
})
