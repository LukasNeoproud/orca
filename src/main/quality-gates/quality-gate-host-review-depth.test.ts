import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setAzureDevOpsReviewWorktreeRegistryPath } from '../azure-devops/review/azure-devops-review-worktree'
import { saveAzureDevOpsReviewWorktreeEntry } from '../azure-devops/review/azure-devops-review-worktree-registry'
import { _setQualityGateServiceForTests, getQualityGateService } from './quality-gate-host'
import { QualityGateRunRefusedError } from './quality-gate-run-refusal'
import type { QualityGateTarget } from './quality-gate-target'

const data = vi.hoisted(() => ({ dir: '' }))

vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => data.dir })
}))

const target: QualityGateTarget = {
  repoId: 'repo',
  worktreeId: 'repo::/work/app-review',
  worktreePath: '/work/app-review',
  gates: [{ id: 'test', name: 'Tests', command: 'exit 1', required: true, timeoutSeconds: 60 }],
  feedbackLoop: { enabled: false, maxRounds: 3 },
  launch: { kind: 'native', cwd: '/work/app-review' },
  source: { path: '/work/app-review', git: false }
}

// The service a real host creates: a missing wire would enforce nothing and fail no other test.
describe('the gate service of this host and the review depth', () => {
  beforeEach(() => {
    data.dir = mkdtempSync(join(tmpdir(), 'orca-gate-host-depth-'))
    _setAzureDevOpsReviewWorktreeRegistryPath(join(data.dir, 'review-worktrees.json'))
    _setQualityGateServiceForTests(null)
    saveAzureDevOpsReviewWorktreeEntry({
      repoKey: 'dev.azure.com/contoso/web/app',
      worktreeId: target.worktreeId,
      repoId: 'repo',
      path: target.worktreePath,
      pullRequestKey: 'dev.azure.com/contoso+repo+7',
      commit: 'sha7',
      reviewDepth: 'static'
    })
  })

  afterEach(() => {
    _setQualityGateServiceForTests(null)
    _setAzureDevOpsReviewWorktreeRegistryPath(null)
    rmSync(data.dir, { recursive: true, force: true })
  })

  it('refuses to start a gate in a review worktree whose review is static', async () => {
    const service = getQualityGateService()
    expect(() => service.run(target, undefined, { kind: 'desktop' })).toThrow(
      QualityGateRunRefusedError
    )
    expect((await service.status(target)).gates[0].latestRun).toBeNull()
  })
})
