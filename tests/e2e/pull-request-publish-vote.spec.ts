import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Locator, Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import {
  failFakeAzureDevOpsComment,
  readFakeAzureDevOpsRequests,
  serveFakeAzureDevOpsPullRequest
} from './helpers/fake-azure-devops-pull-request'
import { cleanupTestRepository } from './global-teardown'

/**
 * Publishing a review with a vote against a made-up Azure DevOps Server: the dialog says what
 * leaves, comments go first and the vote last, a failed comment holds the vote back, and the
 * page and the pull request list show the vote once it is cast.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 93
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const PULL_REQUEST_PATH = `/_apis/git/repositories/${REPOSITORY_ID}/pullrequests/${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = '1'.repeat(40)
const TITLE = 'Round cart totals to cents'
const FIRST_COMMENT = 'Round half up, like the invoice does.'
const FAILING_COMMENT = 'Add a test for an empty cart.'

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

async function openPullRequest(electronApp: ElectronApplication, page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('window.__store is not available')
    }
    state.setRightSidebarTab('pull-requests')
    state.setRightSidebarOpen(true)
  })
  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)
  await expect(page.getByRole('tab', { name: 'Files (1)' })).toBeVisible({ timeout: 30_000 })
}

async function createGeneralDraft(page: Page, body: string): Promise<void> {
  await page.evaluate(
    async ({ pullRequestKey, draftBody }) => {
      const response = await window.api.runtime.call({
        method: 'azureDevOpsReview.createDraft',
        params: { pullRequestKey, kind: 'general', body: draftBody, author: { kind: 'user' } }
      })
      if (!response.ok) {
        throw new Error(response.error.message)
      }
    },
    { pullRequestKey: PULL_REQUEST_KEY, draftBody: body }
  )
}

/** The requests that change something in Azure DevOps, as `METHOD path-after-the-pull-request`. */
async function writes(electronApp: ElectronApplication): Promise<string[]> {
  return (await readFakeAzureDevOpsRequests(electronApp))
    .filter((request) => request.method !== 'GET')
    .map((request) => `${request.method} ${request.path.split(PULL_REQUEST_PATH)[1] ?? ''}`)
}

async function chooseVote(dialog: Locator, page: Page, option: string): Promise<void> {
  await dialog.getByRole('combobox', { name: 'Your vote' }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('publishes drafts with a vote and shows the vote afterwards', async ({
  electronApp,
  orcaPage
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  await muteNotifications(electronApp)
  await serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: PULL_REQUEST_ID,
    baseCommit: BASE_COMMIT,
    sourceCommit: SOURCE_COMMIT,
    title: TITLE,
    changes: [{ changeTrackingId: 1, changeType: 'add', item: { path: '/src/cart.ts' } }],
    files: { [`${SOURCE_COMMIT}:/src/cart.ts`]: 'export const CENTS = 100\n' },
    listed: true
  })
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-83')
  mkdirSync(screenshotDir, { recursive: true })
  const shot = async (name: string): Promise<void> => {
    // Why: a dialog caught while it fades in is unreadable in the snapshot.
    await orcaPage.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null)))
    )
    await orcaPage.screenshot({ path: path.join(screenshotDir, name) })
  }

  await openPullRequest(electronApp, orcaPage)
  const group = (id: string): Locator => orcaPage.locator(`[data-review-group="${id}"]`)
  const row = (id: string): Locator => group(id).getByRole('listitem').filter({ hasText: TITLE })
  await expect(row('awaiting-my-review')).toBeVisible({ timeout: 30_000 })

  await createGeneralDraft(orcaPage, FIRST_COMMENT)
  await createGeneralDraft(orcaPage, FAILING_COMMENT)
  await orcaPage.getByRole('button', { name: 'Reload pull request' }).click()
  await orcaPage.getByRole('tab', { name: 'Drafts (2)' }).click()

  // The dialog names what leaves and changes no vote unless one is chosen.
  await orcaPage.getByRole('button', { name: 'Select all' }).click()
  await orcaPage.getByRole('button', { name: 'Publish selected (2)' }).click()
  const dialog = orcaPage.getByRole('dialog', { name: 'Publish to Azure DevOps' })
  const summary = dialog.getByRole('list', { name: 'What is sent' })
  await expect(dialog.getByRole('combobox', { name: 'Your vote' })).toHaveText(
    'Leave my vote unchanged'
  )
  await expect(dialog.getByText('Your vote now: No vote')).toBeVisible()
  await expect(summary).toContainText('Comments to post: 2')
  await expect(summary).toContainText('Your vote is not changed.')
  await shot('publish-dialog-default.png')

  await dialog.getByRole('combobox', { name: 'Your vote' }).click()
  await expect(orcaPage.getByRole('option')).toHaveText([
    'Leave my vote unchanged',
    'Approve',
    'Approve with suggestions',
    'Wait for author',
    'Reject'
  ])
  await shot('publish-dialog-vote-options.png')
  await orcaPage.getByRole('option', { name: 'Approve', exact: true }).click()
  await expect(summary).toContainText('Your vote changes from No vote to Approved.')
  await expect(summary).toContainText('The vote is sent after the comments')
  await shot('publish-dialog-vote-chosen.png')
  expect(await writes(electronApp)).toEqual([])

  // A comment fails: the other one is posted, the vote stays unsent, and the dialog says so.
  await failFakeAzureDevOpsComment(electronApp, FAILING_COMMENT)
  await dialog.getByRole('button', { name: 'Publish' }).click()
  const report = orcaPage.getByRole('dialog', { name: 'Not everything was sent' })
  await expect(report).toContainText('Comments posted: 1')
  await expect(report).toContainText('Comments not posted: 1')
  await expect(report).toContainText('Your vote was not sent, because a comment was not posted')
  await expect(report.getByRole('button', { name: 'Publish' })).toHaveCount(0)
  await shot('publish-report-incomplete.png')
  expect(await writes(electronApp)).toEqual(['POST /threads', 'POST /threads'])
  await report.getByRole('button', { name: 'Close' }).first().click()
  await expect(orcaPage.getByRole('tab', { name: 'Drafts (1)' })).toBeVisible()
  await expect(orcaPage.getByText('Fake failure 500')).toBeVisible()
  await expect(row('awaiting-my-review')).toBeVisible()

  // Publishing again starts from an unchanged vote; chosen anew, it goes out after the comment.
  await failFakeAzureDevOpsComment(electronApp, null)
  await orcaPage.getByRole('button', { name: 'Select all' }).click()
  await orcaPage.getByRole('button', { name: 'Publish selected (1)' }).click()
  await expect(dialog.getByRole('combobox', { name: 'Your vote' })).toHaveText(
    'Leave my vote unchanged'
  )
  await chooseVote(dialog, orcaPage, 'Approve')
  await dialog.getByRole('button', { name: 'Publish' }).click()
  await expect(
    orcaPage.getByText('Published 1 comments and set your vote to Approved.')
  ).toBeVisible()
  expect(await writes(electronApp)).toEqual([
    'POST /threads',
    'POST /threads',
    'POST /threads',
    'PUT /reviewers/me-guid-1'
  ])
  const requests = await readFakeAzureDevOpsRequests(electronApp)
  expect(requests.filter((request) => request.method === 'PUT').map((r) => r.body)).toEqual([
    { vote: 10, id: 'me-guid-1' }
  ])

  // The page and the list show the vote without a manual refresh.
  await expect(orcaPage.getByText('Your vote: Approved')).toBeVisible()
  await expect(row('other').getByLabel('You approved')).toBeVisible({ timeout: 30_000 })
  await expect(row('awaiting-my-review')).toHaveCount(0)
  await expect(orcaPage.getByRole('tab', { name: 'Drafts (0)' })).toBeVisible()
  await shot('vote-shown-on-page-and-list.png')

  // With no draft left the vote can still be changed on its own.
  await orcaPage.getByRole('button', { name: 'Vote', exact: true }).click()
  await expect(dialog.getByText('Your vote now: Approved')).toBeVisible()
  await expect(summary).toContainText('No comment is posted: no draft is selected.')
  await expect(dialog.getByRole('button', { name: 'Publish' })).toBeDisabled()
  await chooseVote(dialog, orcaPage, 'Wait for author')
  await expect(summary).toContainText('Your vote changes from Approved to Waiting for author.')
  await shot('publish-dialog-vote-only.png')
  await dialog.getByRole('button', { name: 'Publish' }).click()
  await expect(orcaPage.getByText('Your vote is set to Waiting for author.')).toBeVisible()
  await expect(orcaPage.getByText('Your vote: Waiting for author')).toBeVisible()
  await expect(row('other').getByLabel('You are waiting for the author')).toBeVisible({
    timeout: 30_000
  })
  expect((await writes(electronApp)).slice(3)).toEqual([
    'PUT /reviewers/me-guid-1',
    'PUT /reviewers/me-guid-1'
  ])
  const votes = (await readFakeAzureDevOpsRequests(electronApp)).filter(
    (request) => request.method === 'PUT'
  )
  expect(votes.at(-1)?.body).toEqual({ vote: -5, id: 'me-guid-1' })
})
