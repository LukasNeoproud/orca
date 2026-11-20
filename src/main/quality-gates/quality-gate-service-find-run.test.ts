import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { QualityGateDefinition } from '../../shared/quality-gate-types'
import type { QualityGateCommandResult } from './quality-gate-command-run'
import { createQualityGateRunStore } from './quality-gate-run-store'
import { createQualityGateService } from './quality-gate-service'
import type { QualityGateTarget } from './quality-gate-target'

const tests: QualityGateDefinition = {
  id: 'test',
  name: 'Tests',
  command: 'pnpm test',
  required: true,
  timeoutSeconds: 60
}

const FAILED: QualityGateCommandResult = {
  status: 'failed',
  exitCode: 1,
  stdout: 'FAIL cart\n',
  stderr: 'secret-looking log line\n',
  outputTruncated: false,
  error: null
}

describe('finding a quality gate run by its id', () => {
  let dir: string
  let finish: ((result: QualityGateCommandResult) => void) | null

  function target(worktreeId = 'repo::/work'): QualityGateTarget {
    return {
      repoId: 'repo',
      worktreeId,
      worktreePath: '/work',
      gates: [tests],
      feedbackLoop: { enabled: false, maxRounds: 3 },
      launch: { kind: 'native', cwd: '/work' },
      source: { path: '/work', git: true }
    }
  }

  function service(hostInstanceId: string) {
    let nextId = 0
    return createQualityGateService({
      store: createQualityGateRunStore({ filePath: join(dir, 'quality-gate-runs.json') }),
      hostInstanceId,
      runCommand: () =>
        new Promise<QualityGateCommandResult>((resolve) => {
          finish = resolve
        }),
      readSource: async () => ({ head: 'aaa', clean: true, fingerprint: 'f0' }),
      runnerDirectory: join(dir, 'runners'),
      now: Date.now,
      newRunId: () => `${hostInstanceId}-run-${++nextId}`
    })
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-find-run-'))
    finish = null
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the record of a live and of a finished run, without the output', async () => {
    const gates = service('host-a')
    const { id } = gates.run(target(), ['test'], { kind: 'local-cli' }).runs[0].run
    await expect.poll(() => finish).not.toBeNull()
    expect(gates.findRun(id)).toMatchObject({ id, status: 'running', liveness: 'live' })

    finish?.(FAILED)
    await gates.whenIdle('repo::/work')
    const found = gates.findRun(id)
    expect(found).toMatchObject({
      id,
      gateId: 'test',
      worktreeId: 'repo::/work',
      status: 'failed',
      exitCode: 1,
      source: { head: 'aaa', clean: true },
      liveness: 'exited',
      freshness: null
    })
    expect(JSON.stringify(found)).not.toMatch(/stdout|stderr|secret-looking|hostInstanceId/)
  })

  it('finds a run of any worktree and leaves the comparison to the caller', async () => {
    const gates = service('host-a')
    const { id } = gates.run(target('repo::/other'), ['test'], { kind: 'desktop' }).runs[0].run
    await expect.poll(() => finish).not.toBeNull()
    finish?.(FAILED)
    await gates.whenIdle('repo::/other')
    expect(gates.findRun(id)?.worktreeId).toBe('repo::/other')
  })

  it('knows nothing of an id it never issued', () => {
    expect(service('host-a').findRun('made-up')).toBeNull()
  })

  it('shows a live record of a process that is gone as unverifiable, never as failed', async () => {
    const before = service('host-a')
    const { id } = before.run(target(), ['test'], { kind: 'local-cli' }).runs[0].run
    await expect.poll(() => finish).not.toBeNull()
    expect(service('host-b').findRun(id)).toMatchObject({
      status: 'unverifiable',
      liveness: 'unverifiable'
    })
  })
})
