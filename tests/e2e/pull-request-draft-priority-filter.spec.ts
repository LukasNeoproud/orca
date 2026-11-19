import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import {
  readFakeAzureDevOpsRequests,
  serveFakeAzureDevOpsPullRequest
} from './helpers/fake-azure-devops-pull-request'
import { cleanupTestRepository } from './global-teardown'

/**
 * Drafts after an AI review against a made-up Azure DevOps Server: sorted by priority from
 * severity and certainty or by file, narrowed by a filter that counts what it hides, and
 * published by the filter through the usual dialog, which sends exactly the drafts shown.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 126
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const PULL_REQUEST_PATH = `/_apis/git/repositories/${REPOSITORY_ID}/pullrequests/${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = '6'.repeat(40)
const CART = 'src/cart.ts'
const TAX = 'src/tax.ts'
const CART_LINES = [
  'export const CENTS = 100',
  'export function total(prices: number[]): number {',
  '  return prices.reduce((sum, price) => sum + price, 0)',
  '}',
  'export const round = (value: number) => Math.round(value * CENTS) / CENTS'
]
const TAX_LINES = [
  'export const RATE = 0.21',
  'export function tax(amount: number): number {',
  '  return amount * RATE',
  '}'
]

const ERROR_UNCERTAIN = 'Tax is not rounded to cents.'
const WARNING_LIKELY = 'Refunds are summed as if they were prices.'
const ERROR_CONTRADICTED = 'The rate is read from the environment.'
const NIT_LIKELY = 'Name the constant CENTS_PER_UNIT.'
const SUGGESTION_UNCERTAIN = 'Consider a money type for all totals.'
const ERROR_LIKELY = 'round() loses precision for large totals.'
const HAND_WARNING = 'Please add a test for a zero rate.'
const HAND_WRITTEN = 'Thanks, the split into two files reads well.'
const BODIES = [
  ERROR_UNCERTAIN,
  WARNING_LIKELY,
  ERROR_CONTRADICTED,
  NIT_LIKELY,
  SUGGESTION_UNCERTAIN,
  ERROR_LIKELY,
  HAND_WARNING,
  HAND_WRITTEN
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

/** One call of the host's review RPC, the way the agent tools and the app reach it. */
async function createDraft(page: Page, params: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (draftParams) => {
    const response = await window.api.runtime.call({
      method: 'azureDevOpsReview.createDraft',
      params: draftParams
    })
    if (!response.ok) {
      throw new Error(response.error.message)
    }
  }, params)
}

const agent = { kind: 'agent', label: 'claude' }
const inline = (filePath: string, line: number) => ({
  pullRequestKey: PULL_REQUEST_KEY,
  kind: 'inline',
  filePath,
  anchor: { side: 'right', startLine: line, endLine: line }
})
const general = { pullRequestKey: PULL_REQUEST_KEY, kind: 'general' }
const cite = (filePath: string, line: number, quote: string) => ({
  kind: 'code-citation',
  filePath,
  startLine: line,
  endLine: line,
  quote
})

/** Saves a screenshot once animations end, under ORCA_E2E_SCREENSHOT_DIR or a temp folder. */
function screenshots(page: Page): (name: string) => Promise<void> {
  const dir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-126')
  mkdirSync(dir, { recursive: true })
  return async (name) => {
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null)))
    )
    await page.screenshot({ path: path.join(dir, name) })
  }
}

async function openPullRequest(electronApp: ElectronApplication, page: Page): Promise<void> {
  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)
  await expect(page.getByRole('tab', { name: 'Files (2)' })).toBeVisible({ timeout: 30_000 })
}

/** Bodies of the visible draft cards, top to bottom. */
async function shownDrafts(page: Page): Promise<string[]> {
  const items = await page.getByRole('listitem').allTextContents()
  return items.flatMap((text) => BODIES.filter((body) => text.includes(body)))
}

/** Comment texts of the threads the app posted to the fake host. */
async function postedComments(electronApp: ElectronApplication): Promise<string[]> {
  return (await readFakeAzureDevOpsRequests(electronApp))
    .filter(
      (request) =>
        request.method === 'POST' && request.path.endsWith(`${PULL_REQUEST_PATH}/threads`)
    )
    .map((request) => JSON.stringify(request.body))
    .map((body) => BODIES.find((text) => body.includes(JSON.stringify(text))) ?? body)
}

test('sorts drafts by priority, filters them and publishes what the filter shows', async ({
  electronApp,
  orcaPage
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  await serveFakeAzureDevOpsPullRequest(electronApp, {
    repositoryId: REPOSITORY_ID,
    pullRequestId: PULL_REQUEST_ID,
    baseCommit: BASE_COMMIT,
    sourceCommit: SOURCE_COMMIT,
    title: 'Split cart and tax totals',
    changes: [CART, TAX].map((file, index) => ({
      changeTrackingId: index + 1,
      changeType: 'add',
      item: { path: `/${file}` }
    })),
    files: {
      [`${SOURCE_COMMIT}:/${CART}`]: `${CART_LINES.join('\n')}\n`,
      [`${SOURCE_COMMIT}:/${TAX}`]: `${TAX_LINES.join('\n')}\n`
    }
  })
  const shot = screenshots(orcaPage)
  await openPullRequest(electronApp, orcaPage)

  // An AI review with every certainty the host can derive, and two drafts written by hand.
  await createDraft(orcaPage, {
    ...inline(TAX, 2),
    author: agent,
    body: ERROR_UNCERTAIN,
    severity: 'error'
  })
  await createDraft(orcaPage, {
    ...inline(CART, 3),
    author: agent,
    body: WARNING_LIKELY,
    severity: 'warning',
    evidence: [cite(CART, 3, CART_LINES[2])]
  })
  await createDraft(orcaPage, {
    ...inline(TAX, 4),
    author: agent,
    body: ERROR_CONTRADICTED,
    severity: 'error',
    evidence: [cite(TAX, 4, 'const RATE = process.env.RATE')]
  })
  await createDraft(orcaPage, {
    ...inline(CART, 1),
    author: agent,
    body: NIT_LIKELY,
    severity: 'nit',
    evidence: [cite(CART, 1, CART_LINES[0])]
  })
  await createDraft(orcaPage, {
    ...general,
    author: agent,
    body: SUGGESTION_UNCERTAIN,
    severity: 'suggestion'
  })
  await createDraft(orcaPage, {
    ...inline(CART, 5),
    author: agent,
    body: ERROR_LIKELY,
    severity: 'error',
    evidence: [cite(CART, 5, CART_LINES[4])]
  })
  await createDraft(orcaPage, {
    ...inline(TAX, 1),
    author: { kind: 'user' },
    body: HAND_WARNING,
    severity: 'warning'
  })
  await createDraft(orcaPage, { ...general, author: { kind: 'user' }, body: HAND_WRITTEN })

  await orcaPage.getByRole('button', { name: 'Reload pull request' }).click()
  await orcaPage.getByRole('tab', { name: 'Drafts (8)' }).click()

  // By priority: severity first, then certainty; contradicted after the draft without severity.
  await expect
    .poll(() => shownDrafts(orcaPage))
    .toEqual([
      ERROR_LIKELY,
      ERROR_UNCERTAIN,
      WARNING_LIKELY,
      HAND_WARNING,
      SUGGESTION_UNCERTAIN,
      NIT_LIKELY,
      HAND_WRITTEN,
      ERROR_CONTRADICTED
    ])
  await shot('01-sorted-by-priority.png')

  // By file: comments on no file first, then the Files tree order and the line.
  await orcaPage.getByRole('combobox', { name: 'Sort drafts' }).click()
  await orcaPage.getByRole('option', { name: 'By file' }).click()
  await expect
    .poll(() => shownDrafts(orcaPage))
    .toEqual([
      SUGGESTION_UNCERTAIN,
      HAND_WRITTEN,
      NIT_LIKELY,
      WARNING_LIKELY,
      ERROR_LIKELY,
      HAND_WARNING,
      ERROR_UNCERTAIN,
      ERROR_CONTRADICTED
    ])
  await shot('02-sorted-by-file.png')
  await orcaPage.getByRole('combobox', { name: 'Sort drafts' }).click()
  await orcaPage.getByRole('option', { name: 'By priority' }).click()

  // Only errors and warnings that are likely; the hidden drafts are counted next to the filter.
  await orcaPage.getByRole('button', { name: 'Filter', exact: true }).click()
  await orcaPage.getByRole('menuitem', { name: /^Severity/ }).click()
  await orcaPage.getByRole('menuitemcheckbox', { name: /^Error/ }).click()
  await orcaPage.getByRole('menuitemcheckbox', { name: /^Warning/ }).click()
  await shot('03-filter-by-severity.png')
  await orcaPage.getByRole('menuitem', { name: /^Certainty/ }).click()
  await orcaPage.getByRole('menuitemcheckbox', { name: /^Likely/ }).click()
  // One Escape closes the submenu and the menu with it.
  await orcaPage.keyboard.press('Escape')
  await expect(orcaPage.getByRole('menu')).toHaveCount(0)
  await expect.poll(() => shownDrafts(orcaPage)).toEqual([ERROR_LIKELY, WARNING_LIKELY])
  await expect(orcaPage.getByRole('status').filter({ hasText: 'The filter hides' })).toHaveText(
    /The filter hides 6 of 8 drafts, 1 of them without severity\./
  )
  await shot('04-filtered.png')

  // Selecting by the filter picks exactly the two drafts shown, and the dialog counts them.
  await orcaPage.getByRole('button', { name: 'Select shown (2)' }).click()
  await orcaPage.getByRole('button', { name: 'Publish selected (2)' }).click()
  const dialog = orcaPage.getByRole('dialog', { name: 'Publish to Azure DevOps' })
  await expect(dialog.getByRole('list', { name: 'What is sent' })).toContainText(
    'Comments to post: 2'
  )
  await shot('05-publish-dialog.png')
  expect(await postedComments(electronApp)).toEqual([])
  await dialog.getByRole('button', { name: 'Publish' }).click()
  await expect(orcaPage.getByText('Published 2 comments.')).toBeVisible({ timeout: 30_000 })
  await expect(orcaPage.getByRole('tab', { name: 'Drafts (6)' })).toBeVisible()
  expect((await postedComments(electronApp)).sort()).toEqual([ERROR_LIKELY, WARNING_LIKELY].sort())

  // The filter stays while the page is open and says what it hides; clearing it shows the rest.
  await expect(orcaPage.getByText('No draft matches the filter.')).toBeVisible()
  await expect(orcaPage.getByRole('status').filter({ hasText: 'The filter hides' })).toHaveText(
    /The filter hides 6 of 6 drafts, 1 of them without severity\./
  )
  await shot('06-after-publish-filtered.png')
  await orcaPage.getByRole('button', { name: 'Clear filters' }).click()
  await expect
    .poll(() => shownDrafts(orcaPage))
    .toEqual([
      ERROR_UNCERTAIN,
      HAND_WARNING,
      SUGGESTION_UNCERTAIN,
      NIT_LIKELY,
      HAND_WRITTEN,
      ERROR_CONTRADICTED
    ])
  await shot('07-filter-cleared.png')
})
