import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { orcaCliResult, runCompiledOrcaCli } from './helpers/compiled-orca-cli'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import {
  addQualityGate,
  openQualityGateSettings,
  qualityGateRow
} from './helpers/quality-gate-settings-page'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'

/**
 * `orca gates run --no-wait`, `orca gates status` and `orca gates cancel` from a shell against a
 * running app, over a made-up repository. The commands are `echo` and `sleep`.
 */

// An odd duration, so the process check cannot match anything else on the machine.
const SLOW_COMMAND = 'sleep 347'

type RunView = { id: string; gateId: string; status: string; liveness: string }
type StatusResult = { gates: { gate: { id: string }; latestRun: RunView | null }[] }

function slowProcessCount(): number {
  try {
    return execFileSync('pgrep', ['-f', SLOW_COMMAND], { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean).length
  } catch {
    return 0
  }
}

test('quality gates start without waiting and stop from the CLI', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.skip(process.platform === 'win32', 'the made-up gate commands are POSIX shell')
  test.setTimeout(240_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-120')
  mkdirSync(screenshotDir, { recursive: true })
  const repoPath = createSeededTestRepo({ publishPath: false })
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null

  try {
    expect(slowProcessCount()).toBe(0)
    const launched = await session.launch()
    app = launched.app
    const page = launched.page
    await waitForSessionReady(page)
    const workspaceId = await attachRepoAndOpenTerminal(page, repoPath)
    const repoId = workspaceId.slice(0, workspaceId.indexOf('::'))
    const section = await openQualityGateSettings(page, repoId)
    await addQualityGate(section, { name: 'Quick', command: 'echo quick ok' })
    await addQualityGate(section, { name: 'Slow', command: SLOW_COMMAND })
    await addQualityGate(section, { name: 'Tail', command: 'echo tail ok' })

    const cli = (args: string[]) => runCompiledOrcaCli(session.userDataDir, args)
    const worktree = ['--worktree', `id:${workspaceId}`]
    const status = () =>
      orcaCliResult<StatusResult>(session.userDataDir, ['gates', 'status', ...worktree])
    const latest = async (gateId: string) =>
      (await status()).gates.find((entry) => entry.gate.id === gateId)?.latestRun ?? null

    // Nothing runs yet: cancel says so and succeeds.
    const idle = await cli(['gates', 'cancel', ...worktree])
    expect(idle.code, idle.stderr).toBe(0)
    expect(idle.stdout.trim()).toBe(
      'No quality gate is running in this workspace. Nothing was stopped.'
    )

    // A run that would take minutes returns at once with the id of each run.
    const startedAt = Date.now()
    const { runs } = await orcaCliResult<{ runs: { run: RunView; started: boolean }[] }>(
      session.userDataDir,
      ['gates', 'run', '--no-wait', ...worktree]
    )
    expect(Date.now() - startedAt).toBeLessThan(30_000)
    expect(runs.map(({ run }) => run.gateId)).toEqual(['quick', 'slow', 'tail'])
    expect(runs.every(({ started, run }) => started && run.liveness === 'live')).toBe(true)
    const slowRunId = runs[1].run.id

    // Status follows the runs: the quick gate passes, the slow one is running under the same id.
    await expect
      .poll(async () => (await latest('quick'))?.status, { timeout: 30_000 })
      .toBe('passed')
    await expect
      .poll(async () => (await latest('slow'))?.status, { timeout: 30_000 })
      .toBe('running')
    expect((await latest('slow'))?.id).toBe(slowRunId)
    await expect.poll(slowProcessCount).toBeGreaterThan(0)
    const statusText = await cli(['gates', 'status', ...worktree])
    expect(statusText.stdout).toMatch(
      new RegExp(`^running\\tslow\\tSlow\\trequired\\t.*s so far.*\\trun ${slowRunId}$`, 'm')
    )
    expect(statusText.stdout).toMatch(/^queued\ttail\tTail\trequired\t/m)

    // Stopping one gate by name stops its process; the queue then moves on.
    const stopSlow = await cli(['gates', 'cancel', 'Slow', ...worktree])
    expect(stopSlow.code, stopSlow.stderr).toBe(0)
    expect(stopSlow.stdout).toMatch(
      new RegExp(`^Stopped:\\ncancelled\\tslow\\tSlow\\trequired\\t.*\\trun ${slowRunId}$`, 'm')
    )
    await expect.poll(slowProcessCount).toBe(0)
    await expect
      .poll(async () => (await latest('tail'))?.status, { timeout: 30_000 })
      .toBe('passed')

    // Without a name, cancel stops whatever runs in the workspace.
    const again = await cli(['gates', 'run', 'slow', '--no-wait', ...worktree])
    expect(again.code, again.stderr).toBe(0)
    expect(again.stdout).toContain('Not waiting for the result.')
    await expect.poll(slowProcessCount, { timeout: 30_000 }).toBeGreaterThan(0)
    const stopAll = await cli(['gates', 'cancel', ...worktree, '--json'])
    expect(stopAll.code, stopAll.stderr).toBe(0)
    expect(stopAll.json).toMatchObject({
      ok: true,
      result: { cancelled: [{ gateId: 'slow', status: 'cancelled', liveness: 'exited' }] }
    })
    await expect.poll(slowProcessCount).toBe(0)

    const named = await cli(['gates', 'cancel', 'slow', ...worktree])
    expect(named.code, named.stderr).toBe(0)
    expect(named.stdout.trim()).toBe('Not running in this workspace: slow. Nothing was stopped.')
    const unknown = await cli(['gates', 'cancel', 'deploy', ...worktree])
    expect(unknown.code).not.toBe(0)
    expect(unknown.stderr).toContain('No quality gate "deploy"')

    await section.getByRole('button', { name: 'Read the results again' }).click()
    await expect(
      qualityGateRow(section, 'slow').locator('[data-quality-gate-run-status="cancelled"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      qualityGateRow(section, 'tail').locator('[data-quality-gate-run-status="passed"]')
    ).toBeVisible()
    await page.screenshot({ path: path.join(screenshotDir, '01-cancelled-from-cli.png') })
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
  }
  expect(slowProcessCount()).toBe(0)
})
