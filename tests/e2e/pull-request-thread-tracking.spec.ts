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
 * Threads written on the first iteration of a pull request with four iterations, against a
 * made-up Azure DevOps Server: each must show at the lines its code has in the latest iteration,
 * and say so when that code was rewritten or removed.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 91
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const FIRST_COMMIT = '1'.repeat(40)
const LATEST_COMMIT = '4'.repeat(40)
const CART_PATH = 'src/cart.ts'
const COUPON_PATH = 'src/coupon.ts'

const CART_AT_FIRST = [
  'export function total(items: number[]): number {',
  '  let sum = 0',
  '  for (const item of items) {',
  '    sum += item',
  '  }',
  '  return sum',
  '}',
  '',
  'export function isEmpty(items: number[]): boolean {',
  '  return items.length === 0',
  '}',
  ''
].join('\n')
// Since the first iteration: a header was added, the loop body rewritten and isEmpty removed.
const CART_AT_LATEST = [
  '// Cart totals.',
  '',
  'export function total(items: number[]): number {',
  '  let sum = 0',
  '  for (const item of items) {',
  '    sum += Math.max(item, 0)',
  '  }',
  '  return sum',
  '}',
  ''
].join('\n')
const COUPON = ['export const COUPON_PREFIX = "SAVE"', 'export const COUPON_LENGTH = 8', ''].join(
  '\n'
)

function thread(id: number, filePath: string, line: number, content: string) {
  return {
    id,
    status: 'active',
    threadContext: {
      filePath: `/${filePath}`,
      rightFileStart: { line, offset: 1 },
      rightFileEnd: { line, offset: 40 }
    },
    pullRequestThreadContext: {
      changeTrackingId: filePath === CART_PATH ? 1 : 2,
      iterationContext: { firstComparingIteration: 1, secondComparingIteration: 1 }
    },
    comments: [
      {
        id: 1,
        parentCommentId: 0,
        content,
        commentType: 'text',
        publishedDate: '2026-11-17T10:00:00Z',
        author: { id: 'ada-guid', displayName: 'Ada Example' }
      }
    ]
  }
}

const MOVED = 'Return early when the list is empty.'
const REWRITTEN = 'Negative prices must not lower the total.'
const REMOVED = 'This helper has no callers.'
const UNCHANGED = 'Read the prefix from settings.'

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

test('threads of an older iteration show at their lines in the latest iteration', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: PULL_REQUEST_ID,
    baseCommit: BASE_COMMIT,
    sourceCommit: LATEST_COMMIT,
    earlierSourceCommits: [FIRST_COMMIT, '2'.repeat(40), '3'.repeat(40)],
    title: 'Clamp negative prices',
    changes: [
      { changeTrackingId: 1, changeType: 'add', item: { path: `/${CART_PATH}` } },
      { changeTrackingId: 2, changeType: 'add', item: { path: `/${COUPON_PATH}` } }
    ],
    files: {
      [`${FIRST_COMMIT}:/${CART_PATH}`]: CART_AT_FIRST,
      [`${LATEST_COMMIT}:/${CART_PATH}`]: CART_AT_LATEST,
      [`${FIRST_COMMIT}:/${COUPON_PATH}`]: COUPON,
      [`${LATEST_COMMIT}:/${COUPON_PATH}`]: COUPON
    },
    threads: [
      thread(11, CART_PATH, 6, MOVED),
      thread(12, CART_PATH, 4, REWRITTEN),
      thread(13, CART_PATH, 10, REMOVED),
      thread(14, COUPON_PATH, 1, UNCHANGED)
    ]
  })
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-76')
  mkdirSync(screenshotDir, { recursive: true })
  await openPullRequest(electronApp, orcaPage)

  // The thread list names the lines of the latest iteration.
  await orcaPage.getByRole('tab', { name: 'Threads (4)' }).click()
  const row = (text: string): Locator => orcaPage.getByRole('listitem').filter({ hasText: text })
  await expect(row(MOVED)).toContainText(`${CART_PATH}:8`)
  await expect(row(MOVED)).not.toContainText('Outdated')
  await expect(row(REWRITTEN)).toContainText(`${CART_PATH}:6`)
  await expect(row(REWRITTEN)).toContainText('Outdated')
  await expect(row(REMOVED)).toContainText(`${CART_PATH} · was L10 in iteration 1`)
  await expect(row(REMOVED)).toContainText('Outdated')
  await expect(row(UNCHANGED)).toContainText(`${COUPON_PATH}:1`)
  await expect(row(UNCHANGED)).not.toContainText('Outdated')
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'threads-latest-iteration.png') })

  // The diff shows each thread under the line its code moved to.
  await orcaPage.getByRole('tab', { name: 'Files (2)' }).click()
  const card = (text: string): Locator =>
    orcaPage.locator('.orca-diff-comment-card').filter({ hasText: text })
  const meta = (text: string): Locator => card(text).locator('.orca-diff-comment-meta-group')
  await expect(meta(MOVED)).toHaveText('Ada Example line 8 Active', { timeout: 20_000 })
  await expect(meta(REWRITTEN)).toHaveText('Ada Example line 6 Active · Outdated')
  await expect(meta(UNCHANGED)).toHaveText('Ada Example line 1 Active')
  await expect(card(REMOVED)).toHaveCount(0)

  const cartSection = orcaPage
    .locator('[data-index]')
    .filter({ hasText: 'cart.ts' })
    .filter({ has: orcaPage.locator('.monaco-diff-editor') })
  // Why: Monaco keeps a comment's view zone hidden until the editor has grown to fit it, so the
  // card is in the DOM (with its text) a few frames before it has a place.
  await expect(
    cartSection.locator('.orca-diff-comment-card').filter({ hasText: MOVED })
  ).toBeVisible()
  // The moved thread sits between its own line and the next one, read from one layout.
  const position = await cartSection.evaluate((section, cardText) => {
    const text = (element: Element): string =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    const top = (element: Element): number => element.getBoundingClientRect().top
    const lines = [...section.querySelectorAll('.editor.modified .view-line')].sort(
      (a, b) => top(a) - top(b)
    )
    const own = lines.find((line) => text(line) === 'return sum')
    const next = own ? lines.find((line) => top(line) > top(own)) : undefined
    const card = [...section.querySelectorAll('.orca-diff-comment-card')].find((element) =>
      text(element).includes(cardText)
    )
    return {
      card: card ? top(card) : null,
      own: own ? top(own) : null,
      next: next ? top(next) : null,
      nextText: next ? text(next) : null
    }
  }, MOVED)
  expect(position.nextText).toBe('}')
  expect(position.card).toBeGreaterThan(position.own ?? Number.POSITIVE_INFINITY)
  expect(position.card).toBeLessThan(position.next ?? Number.NEGATIVE_INFINITY)
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'diff-latest-iteration.png') })

  // One file at a time: its comment list keeps the thread whose lines are gone.
  await orcaPage.getByRole('button', { name: 'Show one file at a time' }).click()
  await orcaPage.getByText('cart.ts', { exact: true }).click()
  await orcaPage.getByRole('button', { name: 'Comments on this file (3)' }).click()
  const gone = orcaPage.getByRole('listitem').filter({ hasText: REMOVED })
  await expect(gone).toContainText('L10')
  await expect(gone).toContainText('Active · Outdated')
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'file-comments-outdated.png') })
})
