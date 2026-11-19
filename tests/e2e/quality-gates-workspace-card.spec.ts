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
import { worktreeRow } from './worktree-row-locators'

/**
 * The gates glyph on the sidebar card of a made-up repository and of a folder without git: nothing
 * without gates or before a run, then passed, running, failed and out of date, following a run
 * started elsewhere, an edit and a commit, for the active workspace and for one in the background.
 */

const LINT = {
  id: 'lint',
  name: 'Lint',
  command: 'echo lint ok',
  required: true,
  timeoutSeconds: 60
}
const TESTS = {
  id: 'tests',
  name: 'Tests',
  command: 'echo boom >&2; exit 3',
  required: true,
  timeoutSeconds: 60
}
const SLOW = { id: 'slow', name: 'Slow', command: 'sleep 291', required: true, timeoutSeconds: 600 }

async function setGates(page: Page, repoId: string, gates: unknown[]): Promise<void> {
  await page.evaluate(
    async ({ repoId, gates }) => {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the made-up gates above have the shape of a stored definition.
      await window.__store!.getState().updateRepo(repoId, { qualityGates: gates as never })
    },
    { repoId, gates }
  )
}

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

const glyph = (page: Page, workspaceId: string): Locator =>
  worktreeRow(page, workspaceId).locator('[data-workspace-quality-gates-card]')

async function expectGlyph(
  page: Page,
  workspaceId: string,
  state: string,
  timeout = 30_000
): Promise<void> {
  await expect(glyph(page, workspaceId)).toHaveAttribute(
    'data-workspace-quality-gates-card',
    state,
    { timeout }
  )
}

test('the workspace card shows the state of the local gates and follows the workspace', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.skip(process.platform === 'win32', 'the made-up gate commands are POSIX shell')
  test.setTimeout(300_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-121')
  mkdirSync(screenshotDir, { recursive: true })
  const repoPath = createSeededTestRepo({ publishPath: false })
  const folderPath = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-gate-card-')))
  writeFileSync(path.join(folderPath, 'notes.txt'), 'A folder without git.\n')
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null
  const shot = (page: Page, name: string): Promise<Buffer> =>
    page.screenshot({ path: path.join(screenshotDir, name) })
  const runFromShell = (workspaceId: string, gate: string) =>
    runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'run',
      gate,
      '--worktree',
      `id:${workspaceId}`,
      '--json'
    ])

  try {
    const launched = await session.launch()
    app = launched.app
    const page = launched.page
    await waitForSessionReady(page)
    const workspaceId = await attachRepoAndOpenTerminal(page, repoPath)
    const repoId = workspaceId.slice(0, workspaceId.indexOf('::'))
    const card = worktreeRow(page, workspaceId)
    await expect(card.locator('[data-worktree-card-surface]').first()).toBeVisible()

    // No gates, then gates that never ran: the card stays as it was.
    await expect(glyph(page, workspaceId)).toHaveCount(0)
    await setGates(page, repoId, [LINT])
    const section = await openChecks(page, workspaceId)
    await expect(section.locator('[data-workspace-quality-gate="lint"]')).toBeVisible()
    await expect(glyph(page, workspaceId)).toHaveCount(0)

    // A gate run from a shell, as an agent runs it, reaches the card by itself.
    expect((await runFromShell(workspaceId, 'Lint')).code).toBe(0)
    await expectGlyph(page, workspaceId, 'passed')
    await expect(glyph(page, workspaceId)).toHaveAccessibleName('Local gates: 1 passed')
    // The status lane of the agent and the pull request is still there, apart from the glyph.
    await expect(card.locator('[data-worktree-card-status-slot]')).toBeVisible()
    await expect(
      card.locator('[data-worktree-card-status-slot] [data-workspace-quality-gates-card]')
    ).toHaveCount(0)
    await shot(page, '01-passed.png')

    await setGates(page, repoId, [LINT, SLOW])
    await section.getByRole('button', { name: 'Run Slow' }).click()
    await expectGlyph(page, workspaceId, 'running')
    await shot(page, '02-running.png')
    await section.getByRole('button', { name: 'Stop Slow' }).click()
    await expectGlyph(page, workspaceId, 'incomplete')

    await setGates(page, repoId, [LINT, TESTS])
    await section.getByRole('button', { name: 'Run Tests' }).click()
    await expectGlyph(page, workspaceId, 'failed')
    await expect(glyph(page, workspaceId)).toHaveAccessibleName('Local gates: 1 failed · 1 passed')
    await shot(page, '03-failed.png')

    // An edit with nobody touching the app: both results are now from another tree.
    writeFileSync(path.join(repoPath, 'gate-probe.txt'), 'edited after the run\n')
    await expectGlyph(page, workspaceId, 'outdated')
    await shot(page, '04-out-of-date.png')

    // A folder without git shows its gates the same way.
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
    await setGates(page, folder.repoId, [{ ...LINT, id: 'check', name: 'Check' }])
    const folderSection = await openChecks(page, folder.workspaceId)
    await expect(glyph(page, folder.workspaceId)).toHaveCount(0)
    await folderSection.getByRole('button', { name: 'Run all' }).click()
    await expectGlyph(page, folder.workspaceId, 'passed')

    // The repository workspace is in the background now: a run still reaches its card at once,
    // a commit at the slow interval of the host.
    await setGates(page, repoId, [LINT])
    expect((await runFromShell(workspaceId, 'Lint')).code).toBe(0)
    await expectGlyph(page, workspaceId, 'passed')
    await shot(page, '05-folder-and-background-passed.png')
    execFileSync('git', ['-C', repoPath, 'add', '-A'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoPath, 'commit', '-m', 'after the gates ran'], { stdio: 'pipe' })
    await expectGlyph(page, workspaceId, 'outdated', 90_000)
    await expectGlyph(page, folder.workspaceId, 'passed')
    await shot(page, '06-background-out-of-date.png')
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
    rmSync(folderPath, { recursive: true, force: true })
  }
})
