import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Locator, Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import {
  readFakeAzureDevOpsRequests,
  serveFakeAzureDevOpsPullRequest
} from './helpers/fake-azure-devops-pull-request'
import { cleanupTestRepository } from './global-teardown'

/**
 * Agent drafts as findings against a made-up Azure DevOps Server: the host checks each code
 * citation against the file at the draft's commit, the draft card and the diff show severity and
 * certainty, evidence opens in the diff, and publishing sends the comment text alone.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 84
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = '4'.repeat(40)
const FILE_PATH = 'src/cart.ts'

// Why so long: the cited line must be off screen until the diff is asked to show it.
const CITED_LINE = 150
const CITED_CODE = 'export const total = prices.reduce((sum, item) => sum + item, 0)'
const SOURCE_LINES = Array.from({ length: 200 }, (_, index) =>
  index + 1 === CITED_LINE ? CITED_CODE : `export const price${index + 1} = ${index + 1}`
)
const BASE_LINES = SOURCE_LINES.map((line, index) =>
  index === 1 ? 'export const price2 = 0' : line
)

const BARE = 'Negative prices lower the total.'
const CITED = 'The total adds refunds as if they were prices.'
const WRONG = 'The total starts from a hard-coded zero.'
const FOREIGN = 'Checkout shows the old total after a refund.'
const BY_HAND = 'Please add a test for an empty cart.'
const NOTE = 'Adds every price as it is.'

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

type RpcAnswer = { ok: boolean; result?: unknown; error?: { message: string } }

/** One call of the host's review RPC, the way the agent tools and the app reach it. */
function callReview(
  page: Page,
  method: string,
  params: Record<string, unknown>
): Promise<RpcAnswer> {
  return page.evaluate(
    async ({ rpcMethod, rpcParams }) => {
      const response = await window.api.runtime.call({ method: rpcMethod, params: rpcParams })
      return response.ok
        ? { ok: true, result: response.result }
        : { ok: false, error: { message: response.error.message } }
    },
    { rpcMethod: `azureDevOpsReview.${method}`, rpcParams: params }
  )
}

type DraftAnswer = { id: string; severity?: string; certainty?: string; evidenceChecks?: unknown[] }

function draftOf(answer: RpcAnswer): DraftAnswer {
  const result = answer.result
  if (!answer.ok || !result || typeof result !== 'object' || !('draft' in result)) {
    throw new Error(answer.error?.message ?? 'The host returned no draft')
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the host answers createDraft with the draft view; the test reads four of its fields.
  return result.draft as DraftAnswer
}

const agent = { kind: 'agent', label: 'claude' }
const inline = (line: number) => ({
  pullRequestKey: PULL_REQUEST_KEY,
  kind: 'inline',
  filePath: FILE_PATH,
  anchor: { side: 'right', startLine: line, endLine: line },
  author: agent
})
const cite = (quote: string) => ({
  kind: 'code-citation',
  filePath: FILE_PATH,
  startLine: CITED_LINE,
  endLine: CITED_LINE,
  quote,
  note: NOTE
})

async function openPullRequest(electronApp: ElectronApplication, page: Page): Promise<void> {
  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)
  await expect(page.getByRole('tab', { name: 'Files (1)' })).toBeVisible({ timeout: 30_000 })
}

test('agent drafts show severity, certainty and checked evidence', async ({
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
    title: 'Sum the cart in one pass',
    changes: [{ changeTrackingId: 1, changeType: 'edit', item: { path: `/${FILE_PATH}` } }],
    files: {
      [`${BASE_COMMIT}:/${FILE_PATH}`]: `${BASE_LINES.join('\n')}\n`,
      [`${SOURCE_COMMIT}:/${FILE_PATH}`]: `${SOURCE_LINES.join('\n')}\n`
    }
  })
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-84')
  mkdirSync(screenshotDir, { recursive: true })
  const shot = async (name: string): Promise<void> => {
    await orcaPage.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null)))
    )
    await orcaPage.screenshot({ path: path.join(screenshotDir, name) })
  }
  await openPullRequest(electronApp, orcaPage)

  // The host answers every new draft with what it made of the evidence.
  const bare = draftOf(await callReview(orcaPage, 'createDraft', { ...inline(149), body: BARE }))
  expect(bare).toMatchObject({ certainty: 'uncertain' })
  const cited = draftOf(
    await callReview(orcaPage, 'createDraft', {
      ...inline(CITED_LINE),
      body: CITED,
      severity: 'warning',
      evidence: [cite(CITED_CODE)]
    })
  )
  expect(cited).toMatchObject({ certainty: 'likely', evidenceChecks: [{ status: 'confirmed' }] })
  const wrong = draftOf(
    await callReview(orcaPage, 'createDraft', {
      ...inline(151),
      body: WRONG,
      severity: 'error',
      evidence: [cite('export const total = 0')]
    })
  )
  expect(wrong).toMatchObject({
    certainty: 'contradicted',
    evidenceChecks: [{ status: 'refuted', reason: 'text-mismatch', actual: CITED_CODE }]
  })
  const foreign = draftOf(
    await callReview(orcaPage, 'createDraft', {
      pullRequestKey: PULL_REQUEST_KEY,
      kind: 'general',
      body: FOREIGN,
      author: agent,
      evidence: [{ kind: 'emulator-recording', screen: 'Checkout', origin: 'orca' }]
    })
  )
  expect(foreign).toMatchObject({
    certainty: 'uncertain',
    evidenceChecks: [{ status: 'unchecked', reason: 'unknown-kind' }]
  })
  const byHand = draftOf(
    await callReview(orcaPage, 'createDraft', {
      pullRequestKey: PULL_REQUEST_KEY,
      kind: 'general',
      body: BY_HAND,
      author: { kind: 'user' }
    })
  )
  expect(byHand.certainty).toBeUndefined()

  // A value the host cannot read comes back as an error that names the field.
  const badSeverity = await callReview(orcaPage, 'createDraft', {
    ...inline(149),
    body: 'x',
    severity: 'critical'
  })
  expect(badSeverity.error?.message).toContain(
    'severity must be one of error, warning, suggestion, nit'
  )
  const badEvidence = await callReview(orcaPage, 'updateDraft', {
    id: bare.id,
    patch: { evidence: [{ kind: 'code-citation', filePath: FILE_PATH, startLine: 1 }] }
  })
  expect(badEvidence.error?.message).toContain(
    'evidence[0].quote must hold the cited lines as they are in the file'
  )

  await orcaPage.getByRole('button', { name: 'Reload pull request' }).click()
  await orcaPage.getByRole('tab', { name: 'Drafts (5)' }).click()
  const card = (body: string): Locator => orcaPage.getByRole('listitem').filter({ hasText: body })
  const certainty = (body: string): Locator => card(body).locator('[data-certainty]')

  // Certainty on the card: none for the hand-written draft.
  await expect(certainty(BARE)).toHaveAttribute('data-certainty', 'uncertain')
  await expect(certainty(CITED)).toHaveAttribute('data-certainty', 'likely')
  await expect(certainty(WRONG)).toHaveAttribute('data-certainty', 'contradicted')
  await expect(certainty(FOREIGN)).toHaveAttribute('data-certainty', 'uncertain')
  await expect(certainty(BY_HAND)).toHaveCount(0)
  await expect(card(CITED).getByRole('button', { name: 'Severity: Warning' })).toBeVisible()
  await expect(card(WRONG).getByRole('button', { name: 'Severity: Error' })).toBeVisible()
  await expect(card(CITED).getByLabel('Commented code')).toContainText('prices.reduce')
  await expect(card(CITED).getByLabel('Commented code')).toContainText(String(CITED_LINE))

  // A contradicted finding shows its reason without a click.
  await expect(card(WRONG).getByText('Not in the file')).toBeVisible()
  await expect(card(WRONG).getByText('The file has other text at the cited lines:')).toBeVisible()
  await expect(card(WRONG).getByLabel('Code in the file')).toContainText('prices.reduce')
  await shot('01-draft-cards-with-findings.png')

  // Evidence of the other drafts opens on request.
  await expect(card(CITED).getByLabel('Quoted code')).toHaveCount(0)
  await card(CITED).getByRole('button', { name: 'Evidence (1)' }).click()
  await expect(card(CITED).getByText('In the file')).toBeVisible()
  await expect(
    card(CITED)
      .locator('[data-evidence-kind="code-citation"]')
      .getByText(`${FILE_PATH}:${CITED_LINE}`)
  ).toBeVisible()
  await expect(card(CITED).getByText(NOTE)).toBeVisible()
  await expect(card(CITED).getByLabel('Quoted code')).toContainText('prices.reduce')
  await card(FOREIGN).getByRole('button', { name: 'Evidence (1)' }).click()
  await expect(card(FOREIGN).getByText('Not checked')).toBeVisible()
  await expect(card(FOREIGN).getByText('emulator-recording')).toBeVisible()
  await expect(
    card(FOREIGN).getByText('This version of Orca cannot check this kind of evidence.')
  ).toBeVisible()
  // What only a host may write was dropped on the way in.
  await expect(card(FOREIGN).getByLabel('Evidence data')).toContainText('Checkout')
  await expect(card(FOREIGN).getByLabel('Evidence data')).not.toContainText('origin')
  await card(FOREIGN).scrollIntoViewIfNeeded()
  await shot('02-evidence-expanded.png')

  // The user sets a severity; the certainty stays the host's.
  await card(BARE).getByRole('button', { name: 'Severity: No severity' }).click()
  await orcaPage.getByRole('menuitemradio', { name: 'Suggestion' }).click()
  await expect(card(BARE).getByRole('button', { name: 'Severity: Suggestion' })).toBeVisible()
  await expect(certainty(BARE)).toHaveAttribute('data-certainty', 'uncertain')
  const listed = await callReview(orcaPage, 'drafts', { pullRequestKey: PULL_REQUEST_KEY })
  expect(listed.result).toMatchObject({
    drafts: expect.arrayContaining([
      expect.objectContaining({ id: bare.id, severity: 'suggestion', certainty: 'uncertain' })
    ])
  })

  // Evidence opens in the diff at the cited line, where the drafts carry the same marks.
  await card(CITED).getByRole('button', { name: 'Open in diff' }).click()
  await expect(orcaPage.getByRole('tab', { name: 'Files (1)' })).toHaveAttribute(
    'data-state',
    'active'
  )
  const editor = orcaPage.locator('.monaco-diff-editor .editor.modified')
  await expect(editor.locator('.view-line').filter({ hasText: 'prices.reduce' })).toBeVisible({
    timeout: 20_000
  })
  const meta = orcaPage.locator('.orca-diff-comment-meta-group')
  await expect(meta.filter({ hasText: 'Warning · Likely' })).toBeVisible()
  await expect(meta.filter({ hasText: 'Error · Contradicted' })).toBeVisible()
  await expect(meta.filter({ hasText: 'Suggestion · Uncertain' })).toBeVisible()
  await shot('03-diff-opened-at-evidence.png')

  // Publishing sends the comment text and nothing of the finding.
  await orcaPage.getByRole('tab', { name: 'Drafts (5)' }).click()
  await card(CITED).getByRole('checkbox', { name: 'Select draft for publishing' }).click()
  await orcaPage.getByRole('button', { name: 'Publish selected (1)' }).click()
  await orcaPage
    .getByRole('dialog', { name: 'Publish to Azure DevOps' })
    .getByRole('button', { name: 'Publish' })
    .click()
  await expect(orcaPage.getByRole('tab', { name: 'Drafts (4)' })).toBeVisible({ timeout: 30_000 })
  const posted = (await readFakeAzureDevOpsRequests(electronApp)).filter(
    (request) => request.method === 'POST'
  )
  expect(posted).toHaveLength(1)
  expect(posted[0].body).toMatchObject({
    comments: [{ parentCommentId: 0, content: CITED, commentType: 1 }]
  })
  expect(JSON.stringify(posted[0].body)).not.toMatch(
    /severity|warning|evidence|code-citation|prices\.reduce|Adds every price/
  )
})
