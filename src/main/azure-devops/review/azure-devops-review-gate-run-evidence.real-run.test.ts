import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewIteration
} from '../../../shared/azure-devops-review-types'
import type { QualityGateDefinition } from '../../../shared/quality-gate-types'
import type { ReviewFindingEvidence } from '../../../shared/review-finding'
import type { Repo } from '../../../shared/repo-types'
import { runQualityGateCommand } from '../../quality-gates/quality-gate-command-run'
import { createQualityGateRunStore } from '../../quality-gates/quality-gate-run-store'
import {
  createQualityGateService,
  type QualityGateService
} from '../../quality-gates/quality-gate-service'
import { readQualityGateSourceState } from '../../quality-gates/quality-gate-source-state'
import type { QualityGateTarget } from '../../quality-gates/quality-gate-target'
import { describeAzureDevOpsReviewDraftFindings } from './azure-devops-review-draft-findings'
import {
  applyAzureDevOpsReviewDraftPatch,
  buildAzureDevOpsReviewDraft,
  toAzureDevOpsReviewDraftView
} from './azure-devops-review-drafts'
import { azureDevOpsReviewGateRunFacts } from './azure-devops-review-gate-run-evidence'

/**
 * The whole path over a made-up repository: the host's own gate service runs a real command in a
 * git checkout, an agent's draft cites the run by id, and the draft is described the way every
 * read of a pull request describes it.
 */

const PR = 'dev.azure.com/contoso+repo+7'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null'
    }
  }).trim()
}

// The gate fails while the made-up code holds the bug and prints what a test runner would.
const tests: QualityGateDefinition = {
  id: 'test',
  name: 'Tests',
  command: 'if grep -q bug cart.txt; then echo "FAIL cart: negative total"; exit 3; fi; echo ok',
  required: true,
  timeoutSeconds: 60
}

describe.skipIf(process.platform === 'win32')('a finding backed by a real gate run', () => {
  let dir: string
  let worktree: string
  let gates: QualityGateService
  let settings: QualityGateDefinition[]
  let iterations: AzureDevOpsReviewIteration[]
  let nextRun = 0

  const worktreeId = (): string => `repo-1::${worktree}`

  function target(): QualityGateTarget {
    return {
      repoId: 'repo-1',
      worktreeId: worktreeId(),
      worktreePath: worktree,
      gates: settings,
      feedbackLoop: { enabled: false, maxRounds: 3 },
      launch: { kind: 'native', cwd: worktree },
      source: { path: worktree, git: true }
    }
  }

  /** Runs the gate the way `qualityGates.run` does for the agent and returns the id it got. */
  async function runGate(): Promise<string> {
    const started = gates.run(target(), ['test'], { kind: 'local-cli' })
    await gates.whenIdle(worktreeId())
    return started.runs[0].run.id
  }

  function agentDraft(evidence: ReviewFindingEvidence[], commit?: string) {
    return buildAzureDevOpsReviewDraft(
      {
        pullRequestKey: PR,
        kind: 'inline',
        filePath: 'cart.txt',
        anchor: { side: 'right', startLine: 1, endLine: 1 },
        body: 'The total goes negative.',
        author: { kind: 'agent', label: null },
        severity: 'error',
        evidence,
        ...(commit ? { commit } : {})
      },
      { id: 'd1', now: 1, iterations }
    )
  }

  async function describe1(view: AzureDevOpsReviewDraftView): Promise<AzureDevOpsReviewDraftView> {
    const described = await describeAzureDevOpsReviewDraftFindings({
      drafts: [view],
      iterations,
      readFile: async () => ({ state: 'text', lines: ['bug'] }),
      gateRuns: azureDevOpsReviewGateRunFacts(
        {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the facts read only `id` and `qualityGates` of a repository row.
          listRepos: () => [{ id: 'repo-1', qualityGates: settings } as unknown as Repo],
          findReviewWorktree: () => ({
            worktreeId: worktreeId(),
            repoId: 'repo-1',
            path: worktree,
            pullRequestKey: PR,
            commit: git(worktree, 'rev-parse', 'HEAD')
          }),
          findGateRun: (runId) => gates.findRun(runId)
        },
        'repo-key',
        PR
      )
    })
    return described[0]
  }

  const latest = (): AzureDevOpsReviewIteration => iterations.at(-1) ?? iterations[0]
  const viewOf = (draft: ReturnType<typeof agentDraft>): AzureDevOpsReviewDraftView =>
    toAzureDevOpsReviewDraftView(draft, latest())
  const runEvidence = (runId: string): ReviewFindingEvidence => ({
    kind: 'command-run',
    source: 'quality-gate',
    runId
  })

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-evidence-')))
    worktree = join(dir, 'app-review')
    git(dir, 'init', '--quiet', worktree)
    writeFileSync(join(worktree, 'cart.txt'), 'bug\n')
    git(worktree, 'add', '.')
    git(worktree, 'commit', '--quiet', '-m', 'pull request')
    settings = [tests]
    iterations = [
      {
        id: 1,
        sourceCommit: git(worktree, 'rev-parse', 'HEAD'),
        targetCommit: 't',
        baseCommit: 'b'
      }
    ]
    gates = createQualityGateService({
      store: createQualityGateRunStore({ filePath: join(dir, 'quality-gate-runs.json') }),
      hostInstanceId: 'host',
      runCommand: runQualityGateCommand,
      readSource: (source) => readQualityGateSourceState(source),
      runnerDirectory: join(dir, 'runners'),
      now: Date.now,
      newRunId: () => `run-${++nextRun}`
    })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('is verified when the gate failed on the reviewed commit with a clean tree', async () => {
    const runId = await runGate()
    const described = await describe1(viewOf(agentDraft([runEvidence(runId)])))
    expect(described.certainty).toBe('verified')
    expect(described.evidenceChecks).toEqual([
      {
        status: 'confirmed',
        run: expect.objectContaining({
          runId,
          worktreeId: worktreeId(),
          name: 'Tests',
          status: 'failed',
          exitCode: 3,
          commit: iterations[0].sourceCommit,
          cleanTree: true
        })
      }
    ])
    // The reviewer's client reads the output from the gate host, by the ids the check carries.
    const output = await gates.output(target(), runId)
    expect(output.stdout).toContain('FAIL cart: negative total')
  })

  it('reads the outcome from the record, not from what the agent sends along', async () => {
    writeFileSync(join(worktree, 'cart.txt'), 'bug\n// touched\n')
    const runId = await runGate()
    const forged = {
      ...runEvidence(runId),
      status: 'failed',
      exitCode: 1,
      cleanTree: true,
      check: { status: 'confirmed' },
      origin: 'host'
    }
    const described = await describe1(viewOf(agentDraft([forged])))
    expect(described.evidence).toEqual([runEvidence(runId)])
    expect(described.evidenceChecks).toMatchObject([
      { status: 'unchecked', reason: 'run-dirty-tree', run: { cleanTree: false } }
    ])
    expect(described.certainty).toBe('uncertain')
  })

  it('is not verified by a run that passed, and the check says so', async () => {
    writeFileSync(join(worktree, 'cart.txt'), 'fixed\n')
    git(worktree, 'commit', '--quiet', '-am', 'fix')
    iterations.push({
      id: 2,
      sourceCommit: git(worktree, 'rev-parse', 'HEAD'),
      targetCommit: 't',
      baseCommit: 'b'
    })
    const runId = await runGate()
    const described = await describe1(viewOf(agentDraft([runEvidence(runId)])))
    expect(described.evidenceChecks).toMatchObject([
      { status: 'unchecked', reason: 'run-passed', run: { status: 'passed', exitCode: 0 } }
    ])
    expect(described.certainty).toBe('uncertain')
  })

  it('is not verified by a run id the agent made up', async () => {
    const described = await describe1(viewOf(agentDraft([runEvidence('run-999')])))
    expect(described.evidenceChecks).toEqual([{ status: 'unchecked', reason: 'run-not-found' }])
    expect(described.certainty).toBe('uncertain')
  })

  it('is not verified once the user changes the command of the gate', async () => {
    const runId = await runGate()
    settings = [{ ...tests, command: 'true' }]
    const described = await describe1(viewOf(agentDraft([runEvidence(runId)])))
    expect(described.evidenceChecks).toMatchObject([
      { status: 'unchecked', reason: 'run-gate-changed' }
    ])
    expect(described.certainty).toBe('uncertain')
  })

  it('loses its certainty when the draft moves to a newer iteration: the run is stale', async () => {
    const runId = await runGate()
    const draft = agentDraft([runEvidence(runId)])
    expect((await describe1(viewOf(draft))).certainty).toBe('verified')

    writeFileSync(join(worktree, 'cart.txt'), 'bug\nmore\n')
    git(worktree, 'commit', '--quiet', '-am', 'second push')
    iterations.push({
      id: 2,
      sourceCommit: git(worktree, 'rev-parse', 'HEAD'),
      targetCommit: 't',
      baseCommit: 'b'
    })
    // Not moved yet: the draft is outdated, and a failure on the older push proves nothing now.
    const outdated = await describe1(viewOf(draft))
    expect(outdated.outdated).toBe(true)
    expect(outdated.evidenceChecks).toMatchObject([{ reason: 'run-stale-commit' }])
    expect(outdated.certainty).toBe('uncertain')

    const moved = applyAzureDevOpsReviewDraftPatch(
      draft,
      { rebaseToLatest: true },
      { now: 2, latestIteration: latest() }
    )
    expect(moved.commit).toBe(latest().sourceCommit)
    const described = await describe1(viewOf(moved))
    expect(described.evidenceChecks).toMatchObject([
      {
        status: 'unchecked',
        reason: 'run-stale-commit',
        run: { commit: iterations[0].sourceCommit }
      }
    ])
    expect(described.certainty).toBe('uncertain')

    // Run again on the new commit and cite that run: verified again.
    const rerun = await runGate()
    const updated = applyAzureDevOpsReviewDraftPatch(
      moved,
      { evidence: [runEvidence(rerun)] },
      { now: 3, latestIteration: latest() }
    )
    expect((await describe1(viewOf(updated))).certainty).toBe('verified')
  })

  it('gives a draft the user wrote no certainty, whatever run it cites', async () => {
    const runId = await runGate()
    const draft = { ...agentDraft([runEvidence(runId)]), author: { kind: 'user' as const } }
    const described = await describe1(viewOf(draft))
    expect(described.evidenceChecks).toMatchObject([{ status: 'confirmed' }])
    expect(described).not.toHaveProperty('certainty')
  })
})
