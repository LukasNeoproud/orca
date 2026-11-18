import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'

/**
 * The pull request list against a made-up Azure DevOps Server follows the Orca projects:
 * adding or removing one reloads it without the Refresh button.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN_BASE = 'https://ado.invalid/DefaultCollection/Shop/_git'
const REPOSITORIES = { app: 'repo-guid-app', api: 'repo-guid-api' }

const test = base.extend({
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const repoPath = createSeededTestRepo({ publishPath: false })
    execFileSync('git', ['-C', repoPath, 'remote', 'add', 'origin', `${ORIGIN_BASE}/app`], {
      stdio: 'pipe'
    })
    registerPostElectronShutdownCleanup(async () => cleanupTestRepository(repoPath))
    await provideFixture(repoPath)
  }
})

test.use({
  orcaAppExtraEnv: { ORCA_AZURE_DEVOPS_TOKEN: 'e2e-token' },
  minimumSeededWorktreeCount: 1
})

/** One active pull request per repository, keyed by the repository id in the URL. */
async function serveFakeAzureDevOps(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate((_electron, repositories) => {
    const realFetch = globalThis.fetch
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    const titles: Record<string, string> = {
      [repositories.app]: 'Show the cart total',
      [repositories.api]: 'Add the coupon endpoint'
    }
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname !== 'ado.invalid') {
        return realFetch(input, init)
      }
      const apiPath = url.pathname.toLowerCase()
      if (apiPath.endsWith('/_apis/connectiondata')) {
        return json({ authenticatedUser: { id: 'me-guid-1', providerDisplayName: 'Me Example' } })
      }
      for (const [name, id] of Object.entries(repositories)) {
        if (apiPath.endsWith(`/_apis/git/repositories/${name}`)) {
          return json({ id })
        }
        if (apiPath.endsWith(`/_apis/git/repositories/${id}/pullrequests`)) {
          return json({
            value: [
              {
                pullRequestId: name === 'app' ? 11 : 22,
                title: titles[id],
                status: 'active',
                isDraft: false,
                creationDate: '2026-11-17T09:00:00Z',
                sourceRefName: 'refs/heads/feature/change',
                targetRefName: 'refs/heads/main',
                createdBy: { id: 'ada-guid', displayName: 'Ada Example' },
                reviewers: [{ id: 'me-guid-1', vote: 0 }]
              }
            ]
          })
        }
      }
      return json({ message: 'not served by the test' }, 404)
    }
  }, REPOSITORIES)
}

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

test('the pull request list follows added and removed projects', async ({
  electronApp,
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  await waitForSessionReady(orcaPage)
  await serveFakeAzureDevOps(electronApp)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-78')
  mkdirSync(screenshotDir, { recursive: true })
  const apiRepoPath = createSeededTestRepo({ publishPath: false })
  execFileSync('git', ['-C', apiRepoPath, 'remote', 'add', 'origin', `${ORIGIN_BASE}/api`], {
    stdio: 'pipe'
  })
  registerPostElectronShutdownCleanup(async () => cleanupTestRepository(apiRepoPath))

  await openPullRequestsPanel(orcaPage)
  const list = orcaPage.getByRole('region', { name: 'Pull requests' })
  await expect(list.getByText('Show the cart total')).toBeVisible({ timeout: 30_000 })
  await expect(list.getByText('Add the coupon endpoint')).toHaveCount(0)

  const added = await orcaPage.evaluate(
    (repoPath) => window.api.repos.add({ path: repoPath }),
    apiRepoPath
  )
  if ('error' in added) {
    throw new Error(added.error)
  }
  // Well under the three-minute poll: only the project change can bring it in.
  await expect(list.getByText('Add the coupon endpoint')).toBeVisible({ timeout: 15_000 })
  await expect(list.getByText('Show the cart total')).toBeVisible()
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'list-after-project-added.png') })

  await orcaPage.evaluate(
    (repoId) => window.api.repos.removeForHost({ repoId, hostId: 'local' }),
    added.repo.id
  )
  await expect(list.getByText('Add the coupon endpoint')).toHaveCount(0, { timeout: 15_000 })
  await expect(list.getByText('Show the cart total')).toBeVisible()
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'list-after-project-removed.png') })
})
