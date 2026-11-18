import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'
import type { NotificationDispatchRequest } from '../../src/shared/notification-settings-types'

/**
 * The grouped pull request list and the notification of a new review request, against a
 * made-up Azure DevOps Server. What unit tests cannot reach: the list as the real host maps
 * it from REST, the request that crosses IPC, and a notification click arriving in the page.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const ORGANIZATION_KEY = 'ado.invalid/defaultcollection'
const REPOSITORY_ID = 'repo-guid-1'
const ME = 'me-guid-1'
const HANDLED_STORAGE_KEY = 'orca.azureDevOpsReview.autoReviewHandled'

type FakePullRequest = {
  pullRequestId: number
  title: string
  status: 'active'
  isDraft: boolean
  creationDate: string
  sourceRefName: string
  targetRefName: string
  createdBy: { id: string; displayName: string }
  reviewers: { id: string; vote: number }[]
}

declare global {
  var __reviewGroupsRequests: string[] | undefined
  var __reviewGroupsNotifications: NotificationDispatchRequest[] | undefined
}

const keyOf = (pullRequestId: number): string =>
  `${ORGANIZATION_KEY}+${REPOSITORY_ID}+${pullRequestId}`

function pullRequest(
  pullRequestId: number,
  title: string,
  author: { id: string; displayName: string },
  patch: Partial<FakePullRequest> = {}
): FakePullRequest {
  return {
    pullRequestId,
    title,
    status: 'active',
    isDraft: false,
    creationDate: '2026-11-17T09:00:00Z',
    sourceRefName: `refs/heads/feature/${pullRequestId}`,
    targetRefName: 'refs/heads/main',
    createdBy: author,
    reviewers: [],
    ...patch
  }
}

const ada = { id: 'ada-guid', displayName: 'Ada Example' }
const grace = { id: 'grace-guid', displayName: 'Grace Example' }
const me = { id: ME, displayName: 'Me Example' }
const asReviewer = (vote = 0): Partial<FakePullRequest> => ({ reviewers: [{ id: ME, vote }] })

const NEW_REQUEST = 101
const DRAFTED_REQUEST = 102
const PULL_REQUESTS: FakePullRequest[] = [
  pullRequest(NEW_REQUEST, 'Manage saved cards in the profile', ada, asReviewer()),
  pullRequest(DRAFTED_REQUEST, 'Page the order list', grace, asReviewer()),
  pullRequest(201, 'Pay with a saved card', me),
  pullRequest(202, 'Saved card endpoints', me, { isDraft: true }),
  pullRequest(301, 'Fix the cart crash', grace, asReviewer(10)),
  pullRequest(302, 'Rename the checkout module', ada)
]

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

/** Answers the three REST calls a list needs and records every Azure DevOps URL asked for. */
async function serveFakeAzureDevOps(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    (_electron, fake) => {
      const requests: string[] = []
      globalThis.__reviewGroupsRequests = requests
      const realFetch = globalThis.fetch
      const json = (body: unknown, status = 200): Response =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' }
        })
      globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname !== 'ado.invalid') {
          return realFetch(input, init)
        }
        requests.push(`${url.pathname}${url.search}`)
        const apiPath = url.pathname.toLowerCase()
        if (apiPath.endsWith('/_apis/connectiondata')) {
          return json({ authenticatedUser: { id: fake.me, providerDisplayName: 'Me Example' } })
        }
        if (apiPath.endsWith('/_apis/git/repositories/app')) {
          return json({ id: fake.repositoryId })
        }
        if (
          apiPath.endsWith(`/_apis/git/repositories/${fake.repositoryId}/pullrequests`) &&
          url.searchParams.get('searchCriteria.status') === 'active' &&
          !url.searchParams.has('searchCriteria.sourceRefName')
        ) {
          return json({ value: fake.pullRequests })
        }
        return json({ message: 'not served by the test' }, 404)
      }
    },
    { me: ME, repositoryId: REPOSITORY_ID, pullRequests: PULL_REQUESTS }
  )
}

/** Records notification requests instead of showing banners, and reports the user as present. */
async function recordNotifications(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ ipcMain }) => {
    const notifications: NotificationDispatchRequest[] = []
    globalThis.__reviewGroupsNotifications = notifications
    ipcMain.removeHandler('notifications:dispatch')
    ipcMain.handle('notifications:dispatch', (_event, request: NotificationDispatchRequest) => {
      notifications.push(request)
      return { delivered: true }
    })
    // Why: the machine running the suite is usually idle, which would hold the notification back.
    ipcMain.removeHandler('notifications:getDesktopAwayState')
    ipcMain.handle('notifications:getDesktopAwayState', () => false)
  })
}

const reviewRequestNotifications = (
  electronApp: ElectronApplication
): Promise<NotificationDispatchRequest[]> =>
  electronApp.evaluate(() =>
    (globalThis.__reviewGroupsNotifications ?? []).filter(
      (request) => request.source === 'review-request'
    )
  )

async function openPullRequestsPanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('window.__store is not available')
    }
    state.setRightSidebarTab('pull-requests')
    state.setRightSidebarOpen(true)
  })
}

async function restartRenderer(page: Page): Promise<void> {
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__store), null, { timeout: 30_000 })
  await waitForSessionReady(page)
}

test('groups pull requests and announces a new review request once', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  // Two background checks, each 20 s after a renderer start.
  test.setTimeout(240_000)
  await waitForSessionReady(orcaPage)
  await serveFakeAzureDevOps(electronApp)

  const home = await electronApp.evaluate(({ app }) => app.getPath('home'))
  mkdirSync(path.join(home, '.orca'), { recursive: true })
  writeFileSync(
    path.join(home, '.orca', 'azure-devops-review-drafts.json'),
    JSON.stringify({
      version: 1,
      drafts: ['d1', 'd2'].map((id) => ({
        id,
        pullRequestKey: keyOf(DRAFTED_REQUEST),
        kind: 'general',
        body: 'Check the page size limit.'
      }))
    })
  )

  // An earlier session already knew every pull request except the one that just arrived.
  await orcaPage.evaluate(
    ({ storageKey, keys }) => localStorage.setItem(storageKey, JSON.stringify(keys)),
    {
      storageKey: HANDLED_STORAGE_KEY,
      keys: PULL_REQUESTS.filter((pr) => pr.pullRequestId !== NEW_REQUEST).map((pr) =>
        keyOf(pr.pullRequestId)
      )
    }
  )
  await restartRenderer(orcaPage)
  await recordNotifications(electronApp)
  await openPullRequestsPanel(orcaPage)

  const group = (id: string): ReturnType<Page['locator']> =>
    orcaPage.locator(`[data-review-group="${id}"]`)
  const awaiting = group('awaiting-my-review')
  const mine = group('mine')
  const other = group('other')
  await expect(awaiting.getByRole('heading')).toHaveText('Waiting for my review2')
  await expect(mine.getByRole('heading')).toHaveText('My pull requests2')
  await expect(other.getByRole('heading')).toHaveText('Other2')

  const newRow = awaiting.getByRole('listitem').filter({ hasText: 'Manage saved cards' })
  const draftedRow = awaiting.getByRole('listitem').filter({ hasText: 'Page the order list' })
  await expect(newRow.getByRole('button', { name: 'Start review' })).toBeVisible()
  await expect(draftedRow.getByRole('button', { name: 'Continue review' })).toBeVisible()
  await expect(mine.getByRole('button', { name: /review$/ })).toHaveCount(0)
  await expect(other.getByRole('button', { name: /review$/ })).toHaveCount(0)

  // The background check finds the new request: one notification, one mark.
  await expect(newRow.getByText('New', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(draftedRow.getByText('New', { exact: true })).toHaveCount(0)
  await expect.poll(() => reviewRequestNotifications(electronApp)).toHaveLength(1)
  expect((await reviewRequestNotifications(electronApp))[0]).toMatchObject({
    source: 'review-request',
    reviewRequest: {
      key: keyOf(NEW_REQUEST),
      title: `New pull request !${NEW_REQUEST}`,
      body: 'Manage saved cards in the profile · app · Ada Example',
      actionLabel: 'Review'
    }
  })
  await orcaPage.screenshot({ path: testInfo.outputPath('pull-request-groups.png') })

  // Listing asked once per list, never once per pull request.
  const requests = (await electronApp.evaluate(() => globalThis.__reviewGroupsRequests)) ?? []
  expect(requests.filter((url) => /\/pullrequests\/\d+/i.test(url))).toEqual([])
  expect(requests.filter((url) => /\/pullrequests\?/i.test(url)).length).toBeLessThanOrEqual(3)

  const toggle = orcaPage.getByRole('radiogroup', { name: 'Filter by my involvement' })
  await expect(toggle.getByRole('radio', { name: 'All 6' })).toBeVisible()
  await toggle.getByRole('radio', { name: 'Waiting for me 2' }).click()
  await expect(orcaPage.locator('[data-review-group]')).toHaveCount(1)
  await orcaPage.getByRole('textbox', { name: 'Search pull requests' }).fill('order')
  await expect(awaiting.getByRole('heading')).toHaveText('Waiting for my review1')
  await expect(toggle.getByRole('radio', { name: 'Mine 0' })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('pull-request-quick-filter.png') })
  await orcaPage.getByRole('textbox', { name: 'Search pull requests' }).fill('')
  await toggle.getByRole('radio', { name: 'All 6' }).click()

  // Opening the pull request clears its mark.
  await newRow.getByRole('button', { name: 'Start review' }).click()
  await expect(newRow.getByText('New', { exact: true })).toHaveCount(0)
  await expect(newRow.locator('[aria-current="page"]')).toHaveCount(1)

  // A clicked notification reaches the page and opens that pull request.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, keyOf(DRAFTED_REQUEST))
  await expect(draftedRow.locator('[aria-current="page"]')).toHaveCount(1)

  // After a restart the request is offered in the app again, but not announced again.
  await restartRenderer(orcaPage)
  await recordNotifications(electronApp)
  await openPullRequestsPanel(orcaPage)
  await expect(orcaPage.getByText(`New pull request !${NEW_REQUEST}`)).toBeVisible({
    timeout: 60_000
  })
  expect(await reviewRequestNotifications(electronApp)).toEqual([])
  await expect(newRow.getByText('New', { exact: true })).toHaveCount(0)
})
