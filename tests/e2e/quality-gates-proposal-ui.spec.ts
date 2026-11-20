import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { orcaCliResult, runCompiledOrcaCli } from './helpers/compiled-orca-cli'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import {
  addQualityGate,
  openQualityGateSettings,
  qualityGateRow
} from './helpers/quality-gate-settings-page'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'

/**
 * A proposal sent from a shell as an agent would send it, then seen in Local gates and answered
 * in the repository settings: one item accepted, one edited before it is taken, the rest
 * dismissed. The gates are `echo` commands over a made-up repository.
 */

type GateList = { gates: { id: string; command: string; required: boolean }[] }

async function openChecks(page: Page, workspaceId: string): Promise<void> {
  await page.evaluate((workspaceId) => {
    const state = window.__store!.getState()
    state.setActiveWorktree(workspaceId)
    state.setActiveView('terminal')
    state.setRightSidebarTab('checks')
    state.setRightSidebarOpen(true)
  }, workspaceId)
}

test('a proposal of gates is reviewed from Local gates and answered in the settings', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.setTimeout(240_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-149')
  mkdirSync(screenshotDir, { recursive: true })
  const repoPath = createSeededTestRepo({ publishPath: false })
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null

  try {
    const launched = await session.launch()
    app = launched.app
    const page = launched.page
    await waitForSessionReady(page)
    const workspaceId = await attachRepoAndOpenTerminal(page, repoPath)
    const repoId = workspaceId.slice(0, workspaceId.indexOf('::'))
    const worktree = ['--worktree', `id:${workspaceId}`]
    const listed = async (): Promise<GateList['gates']> =>
      (await orcaCliResult<GateList>(session.userDataDir, ['gates', 'list', ...worktree])).gates

    let section = await openQualityGateSettings(page, repoId)
    await addQualityGate(section, { name: 'Lint', command: 'echo lint ok' })

    const proposed = await runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'propose',
      '--gates',
      JSON.stringify([
        { name: 'Unit tests', command: 'echo tests ok', rationale: 'The project has tests' },
        { gateId: 'lint', name: 'Lint', command: 'echo lint strict', required: false },
        { name: 'Build', command: 'echo build ok', timeoutSeconds: 900 }
      ]),
      '--rationale',
      'Made-up checks for a made-up project',
      ...worktree
    ])
    expect(proposed.code, proposed.stderr).toBe(0)

    // Local gates says a proposal waits and leads to it.
    await openChecks(page, workspaceId)
    const localGates = page.locator(`[data-workspace-quality-gates="${workspaceId}"]`)
    const notice = localGates.locator('[data-workspace-quality-gate-proposal]')
    await expect(notice).toContainText('Proposed gates wait for your review: 3', {
      timeout: 30_000
    })
    await page.screenshot({ path: path.join(screenshotDir, '01-local-gates-notice.png') })
    await notice.getByRole('button', { name: 'Review' }).click()

    section = page.locator(`[data-quality-gates-section="${repoId}"]`)
    const proposal = section.getByRole('region', { name: 'Proposed gates' })
    await expect(proposal).toBeVisible({ timeout: 30_000 })
    await expect(proposal.locator('[data-quality-gate-proposal-item]')).toHaveCount(3)
    const change = proposal.locator('[data-quality-gate-proposal-item="item-2"]')
    await expect(change).toContainText('Change')
    await expect(change).toContainText('echo lint ok')
    await expect(change).toContainText('echo lint strict')
    await proposal.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(screenshotDir, '02-proposal-in-settings.png') })

    // One item taken as proposed.
    await proposal.getByRole('button', { name: 'Accept Unit tests' }).click()
    await expect(qualityGateRow(section, 'unit-tests')).toBeVisible({ timeout: 30_000 })
    await expect(proposal.locator('[data-quality-gate-proposal-item="item-1"]')).toHaveCount(0)

    // One edited before it is taken: the user's gate, not the agent's.
    await proposal.getByRole('button', { name: 'Edit Build' }).click()
    const editor = section.locator('[data-quality-gate-editor="new"]')
    await editor.getByLabel('Command').fill('echo build strict')
    // One editor at a time, and no answer while an item is being edited.
    await expect(section.getByRole('button', { name: 'Add Gate' })).toBeDisabled()
    await expect(proposal.getByRole('button', { name: 'Accept all' })).toBeDisabled()
    await expect(proposal.getByRole('button', { name: 'Accept Lint' })).toBeDisabled()
    // Why animations off: the disabled buttons fade, and the shot must show where they end.
    await page.screenshot({
      path: path.join(screenshotDir, '03-editing-an-item.png'),
      animations: 'disabled'
    })
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(qualityGateRow(section, 'build')).toContainText('echo build strict', {
      timeout: 30_000
    })
    await expect(proposal.locator('[data-quality-gate-proposal-item]')).toHaveCount(1)
    await page.screenshot({ path: path.join(screenshotDir, '04-one-item-left.png') })

    // The rest dismissed: the change to Lint never takes effect.
    await proposal.getByRole('button', { name: 'Dismiss all' }).click()
    await expect(proposal).toHaveCount(0, { timeout: 30_000 })
    expect(await listed()).toMatchObject([
      { id: 'lint', command: 'echo lint ok', required: true },
      { id: 'unit-tests', command: 'echo tests ok', required: true },
      { id: 'build', command: 'echo build strict', required: true }
    ])
    const pending = await page.evaluate(async (repo) => {
      const response = await window.api.runtime.call({
        method: 'qualityGates.proposal',
        params: { repo }
      })
      return response.ok ? response.result : response.error
    }, `id:${repoId}`)
    expect(pending).toEqual({ proposal: null })
    await page.screenshot({ path: path.join(screenshotDir, '05-answered.png') })

    await openChecks(page, workspaceId)
    await expect(localGates).toBeVisible({ timeout: 30_000 })
    await expect(notice).toHaveCount(0, { timeout: 30_000 })
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
  }
})
