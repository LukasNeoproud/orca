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
 * Open in diff against a made-up Azure DevOps Server: the diff jumps to the cited line once, and
 * coming back to the file or to the Files tab leaves the diff where the user put it.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 140
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = '4'.repeat(40)
const CART_PATH = 'src/cart.ts'
const COUPON_PATH = 'src/coupon.ts'

// Why so long: the cited line must be off screen unless the diff is asked to show it.
const CITED_LINE = 150
const CITED_CODE = 'export const total = prices.reduce((sum, item) => sum + item, 0)'
const CART = Array.from({ length: 200 }, (_, index) =>
  index + 1 === CITED_LINE ? CITED_CODE : `export const price${index + 1} = ${index + 1}`
)
const CART_AT_BASE = CART.map((line, index) => (index === 1 ? 'export const price2 = 0' : line))
const COUPON = 'export const COUPON_PREFIX = "SAVE"'
const DRAFT = 'The total adds refunds as if they were prices.'

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

async function openPullRequest(electronApp: ElectronApplication, page: Page): Promise<void> {
  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)
  await expect(page.getByRole('tab', { name: 'Files (2)' })).toBeVisible({ timeout: 30_000 })
}

test('open in diff jumps to the cited line once', async ({ electronApp, orcaPage }) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  await serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: PULL_REQUEST_ID,
    baseCommit: BASE_COMMIT,
    sourceCommit: SOURCE_COMMIT,
    title: 'Sum the cart in one pass',
    changes: [
      { changeTrackingId: 1, changeType: 'edit', item: { path: `/${CART_PATH}` } },
      { changeTrackingId: 2, changeType: 'add', item: { path: `/${COUPON_PATH}` } }
    ],
    files: {
      [`${BASE_COMMIT}:/${CART_PATH}`]: `${CART_AT_BASE.join('\n')}\n`,
      [`${SOURCE_COMMIT}:/${CART_PATH}`]: `${CART.join('\n')}\n`,
      [`${SOURCE_COMMIT}:/${COUPON_PATH}`]: `${COUPON}\n`
    }
  })
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-140')
  mkdirSync(screenshotDir, { recursive: true })
  const shot = (name: string) =>
    orcaPage.screenshot({ path: path.join(screenshotDir, `${name}.png`) })
  await openPullRequest(electronApp, orcaPage)

  const created = await orcaPage.evaluate(
    (params) => window.api.runtime.call({ method: 'azureDevOpsReview.createDraft', params }),
    {
      pullRequestKey: PULL_REQUEST_KEY,
      kind: 'inline',
      filePath: CART_PATH,
      anchor: { side: 'right', startLine: CITED_LINE, endLine: CITED_LINE },
      author: { kind: 'agent', label: 'claude' },
      body: DRAFT,
      evidence: [
        {
          kind: 'code-citation',
          filePath: CART_PATH,
          startLine: CITED_LINE,
          endLine: CITED_LINE,
          quote: CITED_CODE
        }
      ]
    }
  )
  expect(created.ok).toBe(true)
  await orcaPage.getByRole('button', { name: 'Reload pull request' }).click()
  await orcaPage.getByRole('tab', { name: 'Drafts (1)' }).click()
  const card: Locator = orcaPage.getByRole('listitem').filter({ hasText: DRAFT })
  await card.getByRole('button', { name: 'Evidence (1)' }).click()
  await card.getByRole('button', { name: 'Open in diff' }).click()

  const modified = orcaPage.locator('.monaco-diff-editor .editor.modified')
  const cited = modified.locator('.view-line').filter({ hasText: 'prices.reduce' })
  await expect(cited).toBeVisible({ timeout: 20_000 })
  await shot('01-open-in-diff-jumped')

  // The user scrolls back to the top, looks at another file and returns.
  // Why near the top: the draft's card sits mid-editor and keeps the wheel to itself.
  await modified.hover({ position: { x: 300, y: 60 } })
  const top = modified.locator('.view-line').filter({ hasText: 'price2 = 2' })
  // Monaco scrolls a few lines per wheel event, however large its delta.
  for (let step = 0; step < 200 && (await top.count()) === 0; step += 1) {
    await orcaPage.mouse.wheel(0, -2000)
  }
  await expect(cited).toHaveCount(0)
  await orcaPage.getByText('coupon.ts', { exact: true }).click()
  await expect(modified.locator('.view-line').filter({ hasText: 'COUPON_PREFIX' })).toBeVisible({
    timeout: 20_000
  })
  await orcaPage.getByText('cart.ts', { exact: true }).click()
  await expect(top).toBeVisible({ timeout: 20_000 })
  // Why wait: a repeated jump would land a few frames after the diff is shown.
  await orcaPage.waitForTimeout(1500)
  await expect(cited).toHaveCount(0)
  await shot('02-back-to-file-no-jump')

  // Leaving the Files tab and coming back opens it as the user left the preference.
  await orcaPage.getByRole('tab', { name: 'Drafts (1)' }).click()
  await orcaPage.getByRole('tab', { name: 'Files (2)' }).click()
  await expect(orcaPage.getByRole('button', { name: 'Show one file at a time' })).toBeVisible()
  await orcaPage.waitForTimeout(1500)
  await expect(cited).toHaveCount(0)
  await shot('03-back-to-tab-no-jump')
})
