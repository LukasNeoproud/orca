import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Locator, Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { serveFakeAzureDevOpsPullRequest } from './helpers/fake-azure-devops-pull-request'
import { cleanupTestRepository } from './global-teardown'

/**
 * Unpublished drafts per file in the Files tree and the changed-file count in the page header,
 * against a made-up Azure DevOps Server.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 125
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = '5'.repeat(40)
const CART = 'src/cart.ts'
const CHECKOUT = 'src/checkout.ts'
const README = 'README.md'
const FILES = [CART, CHECKOUT, README]

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

function servePullRequest(electronApp: ElectronApplication): Promise<void> {
  return serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: PULL_REQUEST_ID,
    baseCommit: BASE_COMMIT,
    sourceCommit: SOURCE_COMMIT,
    title: 'Show the cart total at checkout',
    changes: FILES.map((file, index) => ({
      changeTrackingId: index + 1,
      changeType: 'edit',
      item: { path: `/${file}` }
    })),
    files: Object.fromEntries(
      FILES.flatMap((file) => [
        [`${BASE_COMMIT}:/${file}`, `// ${file}\nexport const before = 1\n`],
        [`${SOURCE_COMMIT}:/${file}`, `// ${file}\nexport const after = 2\n`]
      ])
    )
  })
}

/** A draft written through the host's review RPC, the way the agent tools and the app reach it. */
async function createDraft(page: Page, draft: Record<string, unknown>): Promise<void> {
  const failure = await page.evaluate(async (params) => {
    const response = await window.api.runtime.call({
      method: 'azureDevOpsReview.createDraft',
      params
    })
    return response.ok ? null : response.error.message
  }, draft)
  expect(failure).toBeNull()
}

const agent = { kind: 'agent', label: 'claude' }
const user = { kind: 'user' }
const inline = (filePath: string, author: Record<string, unknown>, body: string) => ({
  pullRequestKey: PULL_REQUEST_KEY,
  kind: 'inline',
  filePath,
  anchor: { side: 'right', startLine: 2, endLine: 2 },
  author,
  body
})

/** Saves a screenshot once animations end, under ORCA_E2E_SCREENSHOT_DIR or a temp folder. */
function screenshots(page: Page): (name: string) => Promise<void> {
  const dir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-125')
  mkdirSync(dir, { recursive: true })
  return async (name) => {
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null)))
    )
    await page.screenshot({ path: path.join(dir, name) })
  }
}

test('the Files tree counts unpublished drafts per file and the header counts changed files', async ({
  electronApp,
  orcaPage
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  await servePullRequest(electronApp)
  const shot = screenshots(orcaPage)
  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)
  await expect(orcaPage.getByRole('tab', { name: 'Files (3)' })).toBeVisible({ timeout: 30_000 })
  await expect(orcaPage.locator('header').getByText(/· Changed files: 3/)).toBeVisible()

  await createDraft(orcaPage, inline(CART, user, 'Name the total after what it holds.'))
  await createDraft(orcaPage, inline(CART, agent, 'The total ignores refunds.'))
  await createDraft(orcaPage, inline(CHECKOUT, agent, 'Checkout reads the total twice.'))
  await createDraft(orcaPage, {
    ...inline(CHECKOUT, agent, 'The old total is still shown.'),
    kind: 'file',
    anchor: null
  })
  // A draft on no file counts on the Drafts tab only.
  await createDraft(orcaPage, {
    pullRequestKey: PULL_REQUEST_KEY,
    kind: 'general',
    author: agent,
    body: 'Consider a test for an empty cart.'
  })
  await orcaPage.getByRole('button', { name: 'Reload pull request' }).click()
  await expect(orcaPage.getByRole('tab', { name: 'Drafts (5)' })).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Files (3)' }).click()

  const tree = orcaPage
    .locator('aside')
    .filter({ has: orcaPage.getByPlaceholder('Filter files...') })
  const row = (file: string): Locator =>
    tree
      .getByRole('button')
      .filter({ has: orcaPage.getByText(path.posix.basename(file), { exact: true }) })
  const count = (file: string): Locator => row(file).locator('[data-file-draft-count]')
  const expectCounts = async (): Promise<void> => {
    await expect(count(CART)).toHaveAttribute('data-file-draft-count', '1/1')
    await expect(count(CART)).toHaveText(/Unpublished drafts: 2, from the agent: 1/)
    await expect(count(CHECKOUT)).toHaveAttribute('data-file-draft-count', '0/2')
    await expect(count(README)).toHaveCount(0)
  }

  // All changes in one scroll, the default view.
  await expect(orcaPage.getByText('3 changed files')).toBeVisible()
  await expectCounts()
  await count(CART).hover()
  await expect(
    orcaPage.getByRole('tooltip').getByText('Unpublished drafts: 2, from the agent: 1')
  ).toBeVisible()
  await shot('01-all-changes-tree-draft-counts.png')

  // One file at a time uses the same tree.
  await orcaPage.getByRole('button', { name: 'Show one file at a time' }).click()
  await expectCounts()
  await shot('02-single-file-tree-draft-counts.png')
})
