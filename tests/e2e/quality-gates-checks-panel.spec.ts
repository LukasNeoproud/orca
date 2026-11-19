import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Locator, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { runCompiledOrcaCli } from './helpers/compiled-orca-cli'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'

/**
 * The local gates section of the Checks panel for a made-up repository and a folder without git:
 * results, run all, run one, stop, the end of the output, and a status that follows a commit, an
 * edit and a run started elsewhere without anybody pressing refresh.
 */

const SLOW_COMMAND = 'sleep 293'
const GATES = [
  { id: 'lint', name: 'Lint', command: 'pwd; echo lint ok', required: true, timeoutSeconds: 60 },
  {
    id: 'tests',
    name: 'Tests',
    command: 'echo boom >&2; exit 3',
    required: false,
    timeoutSeconds: 60
  },
  { id: 'slow', name: 'Slow', command: SLOW_COMMAND, required: true, timeoutSeconds: 600 }
]

async function setGates(page: Page, repoId: string, gates: unknown[]): Promise<void> {
  await page.evaluate(
    async ({ repoId, gates }) => {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the made-up gates above have the shape of a stored definition.
      await window.__store!.getState().updateRepo(repoId, { qualityGates: gates as never })
    },
    { repoId, gates }
  )
}

/** Opens Checks for a workspace and returns its local gates section. */
async function openChecks(page: Page, workspaceId: string): Promise<Locator> {
  await page.evaluate((workspaceId) => {
    const state = window.__store!.getState()
    state.setActiveWorktree(workspaceId)
    state.setActiveView('terminal')
    state.setRightSidebarTab('checks')
    state.setRightSidebarOpen(true)
  }, workspaceId)
  const section = page.locator(`[data-workspace-quality-gates="${workspaceId}"]`)
  await expect(section.getByRole('heading', { name: 'Local gates' })).toBeVisible({
    timeout: 20_000
  })
  return section
}

const row = (section: Locator, gateId: string): Locator =>
  section.locator(`[data-workspace-quality-gate="${gateId}"]`)
const status = (section: Locator, gateId: string, value: string): Locator =>
  row(section, gateId).locator(`[data-quality-gate-run-status="${value}"]`)

test('the Checks panel shows, runs and stops the local gates and follows the workspace', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.skip(process.platform === 'win32', 'the made-up gate commands are POSIX shell')
  test.setTimeout(300_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-86')
  mkdirSync(screenshotDir, { recursive: true })
  const repoPath = createSeededTestRepo({ publishPath: false })
  const folderPath = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-gate-folder-')))
  writeFileSync(path.join(folderPath, 'notes.txt'), 'A folder without git.\n')
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null
  const shot = (page: Page, name: string): Promise<Buffer> =>
    page.screenshot({ path: path.join(screenshotDir, name) })

  try {
    const launched = await session.launch()
    app = launched.app
    const page = launched.page
    await waitForSessionReady(page)
    const workspaceId = await attachRepoAndOpenTerminal(page, repoPath)
    const repoId = workspaceId.slice(0, workspaceId.indexOf('::'))

    // No pull request, no gates: the section says so and leads to the settings.
    const section = await openChecks(page, workspaceId)
    await expect(
      section.getByText('No quality gates are set up for this repository.')
    ).toBeVisible()
    await expect(section.getByRole('button', { name: 'Set up gates' })).toBeVisible()

    // Saving gates in settings reaches the open panel by itself.
    await setGates(page, repoId, GATES)
    for (const gate of GATES) {
      await expect(row(section, gate.id)).toContainText('Not run in this workspace yet')
    }
    await expect(row(section, 'tests')).toContainText('Optional')
    await shot(page, '01-gates-not-run.png')

    await section.getByRole('button', { name: 'Run all' }).click()
    await expect(status(section, 'lint', 'passed')).toBeVisible({ timeout: 30_000 })
    await expect(status(section, 'tests', 'failed')).toBeVisible({ timeout: 30_000 })
    await expect(row(section, 'tests')).toContainText('exit code 3')
    await expect(status(section, 'slow', 'running')).toBeVisible({ timeout: 30_000 })
    await expect(row(section, 'lint')).toContainText('Up to date')
    await expect(row(section, 'lint').locator('[data-quality-gate-run-time]')).toBeVisible()
    const head = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf-8'
    }).trim()
    await expect(row(section, 'lint')).toContainText(head.slice(0, 10))
    await shot(page, '02-running.png')

    // Stop only the running gate; a stopped run is not a result, so it has no freshness.
    await section.getByRole('button', { name: 'Stop Slow' }).click()
    await expect(status(section, 'slow', 'cancelled')).toBeVisible({ timeout: 30_000 })
    await expect(row(section, 'slow')).not.toContainText('Up to date')
    await expect(section.getByRole('button', { name: 'Run all' })).toBeVisible()

    await row(section, 'tests').getByRole('button', { name: 'Output' }).click()
    await expect(
      row(section, 'tests').locator('[data-quality-gate-output="stderr"]')
    ).toContainText('boom')
    await shot(page, '03-results-and-output.png')

    // An edit, then a commit, with nobody touching the panel.
    writeFileSync(path.join(repoPath, 'gate-probe.txt'), 'edited after the run\n')
    await expect(row(section, 'lint')).toContainText('Out of date: files changed', {
      timeout: 20_000
    })
    execFileSync('git', ['-C', repoPath, 'add', '-A'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoPath, 'commit', '-m', 'after the gates ran'], { stdio: 'pipe' })
    await expect(row(section, 'lint')).toContainText('Out of date: another commit', {
      timeout: 20_000
    })
    await shot(page, '04-out-of-date-by-itself.png')

    // A gate finished from a shell, as an agent runs it, shows up here as well.
    const cli = await runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'run',
      'Lint',
      '--worktree',
      `id:${workspaceId}`,
      '--json'
    ])
    expect(cli.code, `${cli.stdout}\n${cli.stderr}`).toBe(0)
    await expect(row(section, 'lint')).toContainText('Up to date', { timeout: 20_000 })
    await expect(row(section, 'lint')).not.toContainText('Out of date')

    // Run one gate from its row.
    await section.getByRole('button', { name: 'Run Tests' }).click()
    await expect(status(section, 'tests', 'failed')).toBeVisible({ timeout: 30_000 })
    await expect(row(section, 'tests')).toContainText('Up to date')
    await shot(page, '05-after-cli-and-run-one.png')

    // A folder without git keeps its Checks tab once it has gates, tied to no commit.
    const folder = await page.evaluate(async (folderPath) => {
      const result = await window.api.repos.add({ path: folderPath, kind: 'folder' })
      if ('error' in result) {
        throw new Error(result.error)
      }
      const store = window.__store!.getState()
      await store.fetchRepos({ runtimeEnvironmentId: null, throwOnError: true })
      await store.fetchWorktrees(result.repo.id)
      const worktree = window.__store!.getState().worktreesByRepo[result.repo.id]?.[0]
      return { repoId: result.repo.id, workspaceId: worktree?.id ?? '' }
    }, folderPath)
    expect(folder.workspaceId).not.toBe('')
    await setGates(page, folder.repoId, [
      {
        id: 'check',
        name: 'Check',
        command: 'ls; echo folder ok',
        required: true,
        timeoutSeconds: 60
      }
    ])
    const folderSection = await openChecks(page, folder.workspaceId)
    await folderSection.getByRole('button', { name: 'Run all' }).click()
    await expect(status(folderSection, 'check', 'passed')).toBeVisible({ timeout: 30_000 })
    await expect(row(folderSection, 'check')).toContainText('Not tied to a commit')
    await shot(page, '06-folder-without-git.png')
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
    rmSync(folderPath, { recursive: true, force: true })
  }
})
