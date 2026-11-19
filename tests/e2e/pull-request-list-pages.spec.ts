import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import {
  readFakeAzureDevOpsRequests,
  serveFakeAzureDevOpsPullRequest
} from './helpers/fake-azure-devops-pull-request'
import { cleanupTestRepository } from './global-teardown'

/**
 * The pull request list against a made-up Azure DevOps Server whose history is longer than one
 * page: All states keeps the old open pull request, says that the list is cut off, and reads
 * the next page only when asked.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const TITLE = 'Remember the last delivery address'
const NEWER_COMPLETED = 150
const NOTE = 'Only the newest pull requests of app are listed.'

const test = base.extend({
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const repoPath = createSeededTestRepo({ publishPath: false })
    execFileSync('git', ['-C', repoPath, 'remote', 'add', 'origin', ORIGIN], { stdio: 'pipe' })
    registerPostElectronShutdownCleanup(async () => cleanupTestRepository(repoPath))
    await provideFixture(repoPath)
  }
})

test.use({
  orcaAppExtraEnv: { ORCA_AZURE_DEVOPS_TOKEN: 'e2e-token' },
  minimumSeededWorktreeCount: 1
})

/** Keeps the review-request banner of the background check off the desktop. */
async function muteNotifications(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('notifications:dispatch')
    ipcMain.handle('notifications:dispatch', () => ({ delivered: true }))
  })
}

/** The list requests so far as `status skip`, oldest first. */
async function listRequests(electronApp: ElectronApplication): Promise<string[]> {
  return (await readFakeAzureDevOpsRequests(electronApp))
    .filter((request) => request.path.endsWith(`/repositories/${REPOSITORY_ID}/pullrequests`))
    .map((request) => {
      const query = new URLSearchParams(request.search)
      return `${query.get('searchCriteria.status')} ${query.get('$skip') ?? 0}`
    })
}

test('keeps an old open pull request under All states and loads older pages on request', async ({
  electronApp,
  orcaPage
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  await muteNotifications(electronApp)
  await serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: 40,
    baseCommit: 'b'.repeat(40),
    sourceCommit: '1'.repeat(40),
    title: TITLE,
    changes: [],
    files: {},
    listed: true,
    newerCompletedPullRequests: NEWER_COMPLETED
  })
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-77')
  mkdirSync(screenshotDir, { recursive: true })

  await orcaPage.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('window.__store is not available')
    }
    state.setRightSidebarTab('pull-requests')
    state.setRightSidebarOpen(true)
  })
  const panel = orcaPage.getByRole('region', { name: 'Pull requests' })
  const openRow = panel.getByRole('listitem').filter({ hasText: TITLE })
  const note = panel.locator('[data-review-list-truncated]')

  // Active: the one open pull request, nothing cut off.
  await expect(openRow).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByText('1 of 1')).toBeVisible()
  await expect(note).toHaveCount(0)

  // All states: a full page of newer completed ones does not push the open one out.
  await panel.getByRole('combobox', { name: 'Filter by status' }).click()
  await orcaPage.getByRole('option', { name: 'All states' }).click()
  await expect(panel.getByText('101 of 101')).toBeVisible({ timeout: 30_000 })
  await expect(openRow).toBeVisible()
  await expect(note).toContainText(NOTE)
  await note.scrollIntoViewIfNeeded()
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'all-states-cut-off.png') })
  const before = await listRequests(electronApp)
  expect(before.filter((request) => request.startsWith('all'))).toEqual(['all 0'])

  // The next page is read only on request, and the note goes once the history ends.
  await note.getByRole('button', { name: 'Load older pull requests' }).click()
  await expect(panel.getByText('151 of 151')).toBeVisible({ timeout: 30_000 })
  await expect(note).toHaveCount(0)
  await expect(openRow).toBeVisible()
  expect((await listRequests(electronApp)).slice(before.length)).toEqual([
    'active 0',
    'all 0',
    'all 100'
  ])
  await openRow.scrollIntoViewIfNeeded()
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'all-states-older-loaded.png') })
})
