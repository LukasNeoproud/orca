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
 * The inline diff of a pull request page against a made-up Azure DevOps Server: removed lines
 * of a changed file must carry their text, and an added file must not start with a removed line.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 78
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = 'c'.repeat(40)
const CHANGED_PATH = 'src/cart.ts'
const ADDED_PATH = 'src/coupon.ts'
const CHANGED_BEFORE = [
  'export function total(items: number[]): number {',
  '  let sum = 0',
  '  for (const item of items) sum += item',
  '  return sum',
  '}',
  ''
].join('\n')
const CHANGED_AFTER = [
  'export function total(items: number[]): number {',
  '  return items.reduce((sum, item) => sum + item, 0)',
  '}',
  ''
].join('\n')
const ADDED = ['export const COUPON_PREFIX = "SAVE"', 'export const COUPON_LENGTH = 8', ''].join(
  '\n'
)

const FILES: Record<string, string> = {
  [`${BASE_COMMIT}:/${CHANGED_PATH}`]: CHANGED_BEFORE,
  [`${SOURCE_COMMIT}:/${CHANGED_PATH}`]: CHANGED_AFTER,
  [`${SOURCE_COMMIT}:/${ADDED_PATH}`]: ADDED
}

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

async function serveFakePullRequest(electronApp: ElectronApplication): Promise<void> {
  await serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: PULL_REQUEST_ID,
    baseCommit: BASE_COMMIT,
    sourceCommit: SOURCE_COMMIT,
    title: 'Simplify the cart total',
    changes: [
      { changeTrackingId: 1, changeType: 'edit', item: { path: `/${CHANGED_PATH}` } },
      { changeTrackingId: 2, changeType: 'add', item: { path: `/${ADDED_PATH}` } }
    ],
    files: FILES
  })
}

/** Text of each removed-lines zone Monaco paints inline, in the modified editor. */
function removedZoneTexts(scope: Locator): Promise<string[]> {
  return scope.locator('.editor.modified .view-zones .line-delete').evaluateAll((zones) =>
    // Why: Monaco paints spaces as no-break spaces.
    zones.map((zone) => (zone.textContent ?? '').replaceAll('\u00a0', ' '))
  )
}

async function openPullRequest(electronApp: ElectronApplication, page: Page): Promise<void> {
  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)
  const filesTab = page.getByRole('tab', { name: 'Files (2)' })
  await expect(filesTab).toBeVisible({ timeout: 30_000 })
  await filesTab.click()
}

test('an inline pull request diff shows removed text and no phantom line in an added file', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await serveFakePullRequest(electronApp)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-78')
  mkdirSync(screenshotDir, { recursive: true })
  await openPullRequest(electronApp, orcaPage)

  // All changes in one scroll: inline by default.
  const section = (name: string): Locator =>
    orcaPage
      .locator('[data-index]')
      .filter({ hasText: name })
      .filter({
        has: orcaPage.locator('.monaco-diff-editor')
      })
  const changed = section('cart.ts')
  const added = section('coupon.ts')
  await expect(changed.locator('.editor.modified .view-line').first()).toBeVisible({
    timeout: 20_000
  })
  await expect(added.locator('.editor.modified .view-line').first()).toBeVisible()
  await expect.poll(() => removedZoneTexts(changed)).not.toEqual([])
  expect((await removedZoneTexts(changed)).join('\n')).toContain('let sum = 0')
  expect(await removedZoneTexts(added)).toEqual([])
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'all-changes-inline.png') })

  // One file at a time, switched to inline.
  await orcaPage.getByRole('button', { name: 'Show one file at a time' }).click()
  await orcaPage.getByRole('button', { name: 'Inline view' }).click()
  const pane = orcaPage.locator('.monaco-diff-editor').first()
  await expect.poll(() => removedZoneTexts(pane)).not.toEqual([])
  expect((await removedZoneTexts(pane)).join('\n')).toContain('let sum = 0')
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'file-inline-changed.png') })

  await orcaPage.getByText('coupon.ts', { exact: true }).click()
  await expect(pane.locator('.editor.modified .view-line').first()).toContainText('COUPON_PREFIX')
  expect(await removedZoneTexts(pane)).toEqual([])
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'file-inline-added.png') })
})
