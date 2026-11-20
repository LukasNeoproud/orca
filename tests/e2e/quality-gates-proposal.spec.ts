import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { RuntimeClient } from '../../src/cli/runtime-client'
import type {
  QualityGateProposal,
  QualityGateResolveProposalResult
} from '../../src/shared/quality-gate-proposal'
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
 * `orca gates propose` from a shell against a running app, then the answer over each transport:
 * the runtime socket an agent calls through is refused, the app's own window is taken. The gates
 * are `echo` commands over a made-up repository.
 */

type GateList = { gates: { id: string; command: string; required: boolean }[] }

/** A call as the app's own window makes it, over its IPC channel. */
function windowCall<T>(page: Page, method: string, params: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, params }) => {
      const response = await window.api.runtime.call({ method, params })
      if (!response.ok) {
        throw new Error(`${response.error.code}: ${response.error.message}`)
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: each caller names the result type of the method it called.
      return response.result as T
    },
    { method, params }
  )
}

test('an agent proposes quality gates from the CLI and only the app window accepts them', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.setTimeout(240_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-148')
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
    const repo = `id:${repoId}`
    const section = await openQualityGateSettings(page, repoId)
    await addQualityGate(section, { name: 'Lint', command: 'echo lint ok' })

    const worktree = ['--worktree', `id:${workspaceId}`]
    const listed = async (): Promise<GateList['gates']> =>
      (await orcaCliResult<GateList>(session.userDataDir, ['gates', 'list', ...worktree])).gates
    const pending = async (): Promise<QualityGateProposal | null> =>
      (
        await windowCall<{ proposal: QualityGateProposal | null }>(page, 'qualityGates.proposal', {
          repo
        })
      ).proposal

    // The agent's side: the shipped CLI over the runtime socket.
    const proposed = await runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'propose',
      '--gates',
      JSON.stringify([
        { name: 'Unit tests', command: 'echo tests ok', rationale: 'The project has tests' },
        { gateId: 'lint', name: 'Lint', command: 'true', required: false }
      ]),
      '--rationale',
      'Made-up checks',
      ...worktree
    ])
    expect(proposed.code, proposed.stderr).toBe(0)
    expect(proposed.stdout).toContain('Proposed 2 quality gate(s). Nothing changed yet')
    expect(proposed.stdout).toContain('change lint\tLint\toptional\t600s\ttrue')

    // Pending on the host, with the gates in force unchanged.
    const proposal = await pending()
    expect(proposal).toMatchObject({
      repoId,
      proposedBy: { kind: 'local-cli' },
      rationale: 'Made-up checks',
      items: [
        { id: 'item-1', name: 'Unit tests' },
        { id: 'item-2', gateId: 'lint' }
      ]
    })
    if (!proposal) {
      throw new Error('no proposal is pending')
    }
    expect(await listed()).toMatchObject([{ id: 'lint', command: 'echo lint ok', required: true }])

    // The runtime socket cannot answer its own proposal, whole or by item.
    const socket = new RuntimeClient(session.userDataDir, 30_000, null, null)
    for (const answer of [
      { action: 'accept' },
      { action: 'accept', itemIds: ['item-2'] },
      { action: 'dismiss' }
    ]) {
      await expect(
        socket.call('qualityGates.resolveProposal', { repo, proposalId: proposal.id, ...answer })
      ).rejects.toThrow(/only in the Orca app/)
    }
    expect(await listed()).toMatchObject([{ id: 'lint', command: 'echo lint ok', required: true }])
    expect(await pending()).toEqual(proposal)

    // The window accepts one item; the other stays pending.
    const one = await windowCall<QualityGateResolveProposalResult>(
      page,
      'qualityGates.resolveProposal',
      { repo, proposalId: proposal.id, action: 'accept', itemIds: ['item-1'] }
    )
    expect(one.gates.map((gate) => gate.id)).toEqual(['lint', 'unit-tests'])
    expect(one.proposal?.items.map((item) => item.id)).toEqual(['item-2'])
    expect(await listed()).toMatchObject([
      { id: 'lint', command: 'echo lint ok', required: true },
      { id: 'unit-tests', command: 'echo tests ok', required: true }
    ])
    await expect(qualityGateRow(section, 'unit-tests')).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(screenshotDir, '01-accepted-item-in-settings.png') })

    // A new proposal replaces the rest, and an answer to the old one is refused.
    const again = await runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'propose',
      '--gates',
      JSON.stringify([{ name: 'Build', command: 'echo build ok' }]),
      ...worktree
    ])
    expect(again.code, again.stderr).toBe(0)
    const replaced = await pending()
    expect(replaced?.items.map((item) => item.name)).toEqual(['Build'])
    await expect(
      windowCall(page, 'qualityGates.resolveProposal', {
        repo,
        proposalId: proposal.id,
        action: 'accept'
      })
    ).rejects.toThrow(/no longer pending/)

    // Dismissed from the window: nothing pending, the gates as they were.
    const dismissed = await windowCall<QualityGateResolveProposalResult>(
      page,
      'qualityGates.resolveProposal',
      { repo, proposalId: replaced?.id, action: 'dismiss' }
    )
    expect(dismissed.proposal).toBeNull()
    expect(await pending()).toBeNull()
    expect((await listed()).map((gate) => gate.id)).toEqual(['lint', 'unit-tests'])
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
  }
})
