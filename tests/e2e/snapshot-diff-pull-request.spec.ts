import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { SNAPSHOT_FIXTURE_PATHS, snapshotFixtureImages } from './helpers/snapshot-image-fixture'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'

/**
 * The Snapshots tab of a pull request page, against a made-up Azure DevOps Server: the change
 * list as the real host maps it from REST, and image bytes that cross IPC into the comparison.
 */

// Why `.invalid`: a request that slips past the stub can never reach a real server.
const ORIGIN = 'https://ado.invalid/DefaultCollection/Shop/_git/app'
const REPOSITORY_ID = 'repo-guid-1'
const PULL_REQUEST_ID = 64
const PULL_REQUEST_KEY = `ado.invalid/defaultcollection+${REPOSITORY_ID}+${PULL_REQUEST_ID}`
const BASE_COMMIT = 'b'.repeat(40)
const SOURCE_COMMIT = 'c'.repeat(40)

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

type FakeChange = { changeTrackingId: number; changeType: string; item: { path: string } }

/** Answers the REST calls of one pull request's detail and of its files' bytes. */
async function serveFakePullRequest(electronApp: ElectronApplication): Promise<void> {
  const images = snapshotFixtureImages()
  const change = (id: number, changeType: string, relativePath: string): FakeChange => ({
    changeTrackingId: id,
    changeType,
    item: { path: `/${relativePath}` }
  })
  await electronApp.evaluate(
    (_electron, fake) => {
      const realFetch = globalThis.fetch
      const json = (body: unknown, status = 200): Response =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' }
        })
      const pullRequestPath = `/_apis/git/repositories/${fake.repositoryId}/pullrequests/${fake.pullRequestId}`
      globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname !== 'ado.invalid') {
          return realFetch(input, init)
        }
        const apiPath = url.pathname.toLowerCase()
        if (apiPath.endsWith('/_apis/connectiondata')) {
          return json({ authenticatedUser: { id: 'me-guid-1', providerDisplayName: 'Me Example' } })
        }
        if (apiPath.endsWith('/_apis/git/repositories/app')) {
          return json({ id: fake.repositoryId })
        }
        if (apiPath.endsWith(pullRequestPath)) {
          return json({
            pullRequestId: fake.pullRequestId,
            title: 'Restyle the payment screen',
            description: 'New button colour and a longer amount line.',
            status: 'active',
            isDraft: false,
            creationDate: '2026-11-17T09:00:00Z',
            sourceRefName: 'refs/heads/feature/payment-restyle',
            targetRefName: 'refs/heads/main',
            createdBy: { id: 'ada-guid', displayName: 'Ada Example' },
            reviewers: [{ id: 'me-guid-1', vote: 0 }]
          })
        }
        if (apiPath.endsWith(`${pullRequestPath}/iterations`)) {
          return json({
            value: [
              {
                id: 1,
                sourceRefCommit: { commitId: fake.sourceCommit },
                commonRefCommit: { commitId: fake.baseCommit },
                targetRefCommit: { commitId: fake.baseCommit }
              }
            ]
          })
        }
        if (apiPath.endsWith(`${pullRequestPath}/iterations/1/changes`)) {
          return json({ changeEntries: fake.changes })
        }
        if (apiPath.endsWith(`${pullRequestPath}/threads`)) {
          return json({ value: [] })
        }
        if (apiPath.endsWith(`/_apis/git/repositories/${fake.repositoryId}/items`)) {
          const side = url.searchParams.get('versionDescriptor.version') ?? ''
          const encoded = fake.files[`${side}:${url.searchParams.get('path') ?? ''}`]
          return encoded
            ? new Response(Buffer.from(encoded, 'base64'), {
                headers: { 'Content-Type': 'application/octet-stream' }
              })
            : json({ message: 'not found' }, 404)
        }
        return json({ message: 'not served by the test' }, 404)
      }
    },
    {
      repositoryId: REPOSITORY_ID,
      pullRequestId: PULL_REQUEST_ID,
      baseCommit: BASE_COMMIT,
      sourceCommit: SOURCE_COMMIT,
      changes: [
        change(1, 'edit', SNAPSHOT_FIXTURE_PATHS.source),
        change(2, 'edit', SNAPSHOT_FIXTURE_PATHS.changed),
        change(3, 'add', SNAPSHOT_FIXTURE_PATHS.added),
        change(4, 'delete', SNAPSHOT_FIXTURE_PATHS.removed),
        change(5, 'add', SNAPSHOT_FIXTURE_PATHS.unrelatedImage)
      ],
      files: {
        [`${BASE_COMMIT}:/${SNAPSHOT_FIXTURE_PATHS.changed}`]:
          images.changedBefore.toString('base64'),
        [`${SOURCE_COMMIT}:/${SNAPSHOT_FIXTURE_PATHS.changed}`]:
          images.changedAfter.toString('base64'),
        [`${SOURCE_COMMIT}:/${SNAPSHOT_FIXTURE_PATHS.added}`]: images.added.toString('base64'),
        [`${BASE_COMMIT}:/${SNAPSHOT_FIXTURE_PATHS.removed}`]: images.removed.toString('base64')
      }
    }
  )
}

test('shows the snapshot images a pull request changes on its page', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await serveFakePullRequest(electronApp)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-64')
  mkdirSync(screenshotDir, { recursive: true })

  // The way a clicked review-request notification opens the page.
  await electronApp.evaluate(({ BrowserWindow }, key) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('reviewRequest:open', { key })
    }
  }, PULL_REQUEST_KEY)

  await expect(orcaPage.getByRole('tab', { name: 'Files (5)' })).toBeVisible({ timeout: 30_000 })
  const snapshotsTab = orcaPage.getByRole('tab', { name: 'Snapshots (3)' })
  await expect(snapshotsTab).toBeVisible()
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'pull-request-snapshots-tab.png') })
  await snapshotsTab.click()

  const view = orcaPage.getByTestId('snapshot-diff-view')
  await expect(view).toContainText('Changed snapshot images: 3 · in this pull request')
  const rows = view.getByTestId('snapshot-diff-entry')
  await expect(rows).toHaveCount(3)
  const listed = await rows.evaluateAll((items) =>
    items.map((item) => `${item.getAttribute('title')} ${item.textContent?.slice(0, 1)}`)
  )
  expect(listed).toEqual([
    `${SNAPSHOT_FIXTURE_PATHS.changed} M`,
    `${SNAPSHOT_FIXTURE_PATHS.added} A`,
    `${SNAPSHOT_FIXTURE_PATHS.removed} D`
  ])

  const detail = view.getByTestId('snapshot-diff-detail')
  await expect(detail.getByTestId('snapshot-diff-summary')).toContainText('Change areas: 3', {
    timeout: 20_000
  })
  await expect(detail.locator('img')).toHaveCount(3)
  await expect(detail.locator('[data-snapshot-region]')).toHaveText(['1', '2', '3'])
  await orcaPage.screenshot({ path: path.join(screenshotDir, 'pull-request-snapshots.png') })

  await rows.nth(1).click()
  await expect(detail.getByRole('status')).toContainText('New snapshot')
  await rows.nth(2).click()
  await expect(detail.getByRole('status')).toContainText('Removed snapshot')
})
