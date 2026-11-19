import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
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
 * Quitting Orca while a quality gate runs: the command and the processes it started are stopped,
 * and the next start shows the run as stopped because Orca quit. The commands are `sleep`.
 */

// Odd durations, so the process check cannot match anything else on the machine.
const SLOW_COMMAND = 'sleep 331 & sleep 332 & wait'
const SLOW_PATTERN = 'sleep 33[12]'

function slowProcesses(): string[] {
  try {
    return execFileSync('pgrep', ['-f', SLOW_PATTERN], { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

test('quitting Orca stops a running quality gate and records why', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.skip(process.platform === 'win32', 'the made-up gate command is POSIX shell')
  test.setTimeout(240_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-119')
  mkdirSync(screenshotDir, { recursive: true })
  const repoPath = createSeededTestRepo({ publishPath: false })
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null

  try {
    expect(slowProcesses()).toEqual([])
    const first = await session.launch()
    app = first.app
    await waitForSessionReady(first.page)
    const workspaceId = await attachRepoAndOpenTerminal(first.page, repoPath)
    const repoId = workspaceId.slice(0, workspaceId.indexOf('::'))
    const section = await openQualityGateSettings(first.page, repoId)
    await addQualityGate(section, { name: 'Slow', command: SLOW_COMMAND })
    await section.getByRole('button', { name: 'Run Gates' }).click()
    await expect(
      qualityGateRow(section, 'slow').locator('[data-quality-gate-run-status="running"]')
    ).toBeVisible({ timeout: 30_000 })
    // The shell and both of its children.
    await expect.poll(() => slowProcesses().length).toBeGreaterThanOrEqual(3)
    await first.page.screenshot({ path: path.join(screenshotDir, '01-running.png') })

    await session.close(app)
    app = null
    // Quit waits for the stop, so nothing may be left the moment the app is gone.
    expect(slowProcesses()).toEqual([])

    const second = await session.launch()
    app = second.app
    await waitForSessionReady(second.page)
    const restored = await openQualityGateSettings(second.page, repoId)
    const slow = qualityGateRow(restored, 'slow')
    await expect(slow.locator('[data-quality-gate-run-status="cancelled"]')).toBeVisible({
      timeout: 30_000
    })
    await expect(slow).toContainText('Stopped because Orca quit while the gate was running.')
    await expect(slow.locator('[data-quality-gate-run-status="unverifiable"]')).toHaveCount(0)
    await second.page.screenshot({ path: path.join(screenshotDir, '02-after-restart.png') })
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
  }
})
