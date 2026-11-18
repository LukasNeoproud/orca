import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Locator, Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import {
  serveFakeAzureDevOpsPullRequest,
  setFakeAzureDevOpsFile
} from './helpers/fake-azure-devops-pull-request'
import { cleanupTestRepository } from './global-teardown'

/**
 * A pull request page against a made-up Azure DevOps Server whose original side of a changed or
 * deleted file fails to load: the diff must say so and offer a retry instead of showing the file
 * as added over an empty original.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 114
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = 'c'.repeat(40)
const BEFORE = ['export function total(items: number[]): number {', '  let sum = 0', '}', ''].join(
  '\n'
)
const AFTER = ['export function total(items: number[]): number {', '  return 0', '}', ''].join('\n')
const UNLOADED_ORIGINAL = /original version of this file could not be loaded/

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

const atBase = (file: string): string => `${BASE_COMMIT}:/${file}`
const atSource = (file: string): string => `${SOURCE_COMMIT}:/${file}`
const change = (
  id: number,
  changeType: string,
  file: string
): { changeTrackingId: number; changeType: string; item: { path: string } } => ({
  changeTrackingId: id,
  changeType,
  item: { path: `/${file}` }
})

async function servePullRequest(electronApp: ElectronApplication): Promise<void> {
  await serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: PULL_REQUEST_ID,
    baseCommit: BASE_COMMIT,
    sourceCommit: SOURCE_COMMIT,
    title: 'Tidy the cart',
    changes: [
      // Original 404s, then loads after a retry.
      change(1, 'edit', 'src/cart.ts'),
      // Original 404s for good.
      change(2, 'edit', 'src/tax.ts'),
      // Original fails with a server error.
      change(3, 'edit', 'src/price.ts'),
      change(4, 'delete', 'src/legacy.ts'),
      change(5, 'add', 'src/coupon.ts'),
      // Original really is empty.
      change(6, 'edit', 'src/empty.ts')
    ],
    files: {
      [atSource('src/cart.ts')]: AFTER,
      [atSource('src/tax.ts')]: AFTER,
      [atBase('src/price.ts')]: 500,
      [atSource('src/price.ts')]: AFTER,
      [atSource('src/coupon.ts')]: AFTER,
      [atBase('src/empty.ts')]: '',
      [atSource('src/empty.ts')]: AFTER
    }
  })
}

/** Text of each removed-lines zone Monaco paints inline, in the modified editor. */
function removedZoneTexts(scope: Locator): Promise<string[]> {
  return scope.locator('.editor.modified .view-zones .line-delete').evaluateAll((zones) =>
    // Why: Monaco paints spaces as no-break spaces.
    zones.map((zone) => (zone.textContent ?? '').replaceAll(' ', ' '))
  )
}

async function openPullRequest(electronApp: ElectronApplication, page: Page): Promise<void> {
  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)
  const filesTab = page.getByRole('tab', { name: 'Files (6)' })
  await expect(filesTab).toBeVisible({ timeout: 30_000 })
  await filesTab.click()
}

test('a changed file whose original side fails to load shows an error with a retry', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await servePullRequest(electronApp)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-114')
  mkdirSync(screenshotDir, { recursive: true })
  await openPullRequest(electronApp, orcaPage)

  // All changes in one scroll.
  const section = (name: string): Locator =>
    orcaPage.locator('[data-index]').filter({ hasText: name })
  const editor = (name: string): Locator => section(name).locator('.monaco-diff-editor')
  await expect(editor('coupon.ts').locator('.editor.modified .view-line').first()).toBeVisible({
    timeout: 20_000
  })
  for (const name of ['cart.ts', 'tax.ts', 'legacy.ts']) {
    await expect(section(name)).toContainText(UNLOADED_ORIGINAL)
    await expect(section(name).getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(editor(name)).toHaveCount(0)
  }
  await expect(section('price.ts')).toContainText('Fake failure 500')
  await expect(section('price.ts').getByRole('button', { name: 'Retry' })).toBeVisible()
  // Added and really empty originals still diff as before.
  expect(await removedZoneTexts(editor('coupon.ts'))).toEqual([])
  await expect(editor('empty.ts').locator('.editor.modified .view-line').first()).toContainText(
    'export function total'
  )
  await expect(section('empty.ts')).not.toContainText(UNLOADED_ORIGINAL)
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'all-changes-unloaded-original.png') })

  await setFakeAzureDevOpsFile(electronApp, atBase('src/cart.ts'), BEFORE)
  await section('cart.ts').getByRole('button', { name: 'Retry' }).click()
  await expect.poll(() => removedZoneTexts(editor('cart.ts'))).not.toEqual([])
  expect((await removedZoneTexts(editor('cart.ts'))).join('\n')).toContain('let sum = 0')
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'all-changes-after-retry.png') })

  // One file at a time.
  await orcaPage.getByRole('button', { name: 'Show one file at a time' }).click()
  await orcaPage.getByText('legacy.ts', { exact: true }).click()
  const alert = orcaPage.getByRole('alert').filter({ hasText: UNLOADED_ORIGINAL })
  await expect(alert).toBeVisible()
  await expect(orcaPage.locator('.monaco-diff-editor')).toHaveCount(0)
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'file-unloaded-original.png') })

  await setFakeAzureDevOpsFile(electronApp, atBase('src/legacy.ts'), BEFORE)
  await orcaPage.getByRole('button', { name: 'Retry' }).click()
  await orcaPage.getByRole('button', { name: 'Inline view' }).click()
  const pane = orcaPage.locator('.monaco-diff-editor').first()
  await expect.poll(() => removedZoneTexts(pane)).not.toEqual([])
  expect((await removedZoneTexts(pane)).join('\n')).toContain('let sum = 0')
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'file-after-retry.png') })

  await orcaPage.getByText('tax.ts', { exact: true }).click()
  await expect(alert).toBeVisible()
})
