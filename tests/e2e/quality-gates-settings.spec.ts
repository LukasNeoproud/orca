import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Locator, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { runCompiledOrcaCli } from './helpers/compiled-orca-cli'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { waitForSessionReady } from './helpers/store'
import { cleanupTestRepository } from './global-teardown'

/**
 * Quality gates in the repository settings of a made-up repository: define, reorder, edit and
 * remove them, run them in a workspace, stop a running one, see a result go out of date, and find
 * everything still there after a restart; and the same gates run from a shell with `orca gates run`.
 * The commands are harmless (`echo`, `exit`, `sleep`).
 */

// An odd duration, so the process check below cannot match anything else on the machine.
const SLOW_COMMAND = 'sleep 317'

async function openRepoSettings(page: Page, repoId: string): Promise<Locator> {
  await page.evaluate((repoId) => {
    const state = window.__store!.getState()
    state.openSettingsTarget({ pane: 'repo', repoId })
    state.openSettingsPage()
  }, repoId)
  await expect(page.getByPlaceholder('Search settings')).toBeVisible({ timeout: 10_000 })
  // Why: first-run announcements can cover the settings pane on fresh profiles.
  const maybeLater = page.getByRole('button', { name: 'Maybe Later' })
  if (await maybeLater.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await maybeLater.click()
  }
  const section = page.locator(`[data-quality-gates-section="${repoId}"]`)
  await section.scrollIntoViewIfNeeded()
  await expect(section.getByRole('heading', { name: 'Quality Gates' })).toBeVisible()
  return section
}

async function addGate(
  section: Locator,
  gate: { name: string; command: string; timeout?: string; optional?: boolean }
): Promise<void> {
  await section.getByRole('button', { name: 'Add Gate' }).click()
  const editor = section.locator('[data-quality-gate-editor="new"]')
  await editor.getByLabel('Name').fill(gate.name)
  await editor.getByLabel('Command').fill(gate.command)
  if (gate.timeout) {
    await editor.getByLabel('Time limit (seconds)').fill(gate.timeout)
  }
  if (gate.optional) {
    await editor.getByRole('switch', { name: 'Required' }).click()
  }
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(editor).toHaveCount(0)
}

function gateOrder(section: Locator): Promise<string[]> {
  return section
    .locator('[data-quality-gate-row]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-quality-gate-row') ?? ''))
}

function row(section: Locator, gateId: string): Locator {
  return section.locator(`[data-quality-gate-row="${gateId}"]`)
}

function slowProcessCount(): number {
  try {
    return execFileSync('pgrep', ['-f', SLOW_COMMAND], { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean).length
  } catch {
    return 0
  }
}

test('quality gates are set up, run, stopped and kept in repository settings', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.skip(process.platform === 'win32', 'the made-up gate commands are POSIX shell')
  test.setTimeout(300_000)
  const screenshotDir =
    process.env.ORCA_E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'orca-review-ide', 'task-85')
  mkdirSync(screenshotDir, { recursive: true })
  const repoPath = createSeededTestRepo({ publishPath: false })
  const folderPath = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-gate-folder-')))
  writeFileSync(path.join(folderPath, 'notes.txt'), 'A folder without git.\n')
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null
  const shot = (page: Page, name: string): Promise<Buffer> =>
    page.screenshot({ path: path.join(screenshotDir, name) })

  try {
    const first = await session.launch()
    app = first.app
    const page = first.page
    await waitForSessionReady(page)
    const workspaceId = await attachRepoAndOpenTerminal(page, repoPath)
    const repoId = workspaceId.slice(0, workspaceId.indexOf('::'))
    const section = await openRepoSettings(page, repoId)

    await expect(
      section.getByText('No quality gates are set up for this repository.')
    ).toBeVisible()

    // A draft that says nothing is not saved, and says why.
    await section.getByRole('button', { name: 'Add Gate' }).click()
    const empty = section.locator('[data-quality-gate-editor="new"]')
    await empty.getByRole('button', { name: 'Save' }).click()
    await expect(empty.getByText('Enter a name.')).toBeVisible()
    await expect(empty.getByText('Enter a command.')).toBeVisible()
    await empty.getByRole('button', { name: 'Cancel' }).click()

    await addGate(section, { name: 'Lint', command: 'pwd; echo lint ok' })
    await addGate(section, { name: 'Slow', command: SLOW_COMMAND })
    await addGate(section, {
      name: 'Tests',
      command: 'echo boom >&2; exit 3',
      timeout: '30',
      optional: true
    })
    expect(await gateOrder(section)).toEqual(['lint', 'slow', 'tests'])

    await section.getByRole('button', { name: 'Move Tests up' }).click()
    await expect.poll(() => gateOrder(section)).toEqual(['lint', 'tests', 'slow'])

    await section.getByRole('button', { name: 'Edit Lint' }).click()
    const editor = section.locator('[data-quality-gate-editor="lint"]')
    await editor.getByLabel('Time limit (seconds)').fill('45')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(row(section, 'lint')).toContainText('Limit 45 s')
    await expect(row(section, 'tests')).toContainText('Optional')
    await expect(row(section, 'lint')).toContainText('Not run in this workspace yet')
    await shot(page, '01-gates-defined.png')

    await section.getByRole('button', { name: 'Run Gates' }).click()
    await expect(
      row(section, 'lint').locator('[data-quality-gate-run-status="passed"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      row(section, 'tests').locator('[data-quality-gate-run-status="failed"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect(row(section, 'tests')).toContainText('exit code 3')
    await expect(
      row(section, 'slow').locator('[data-quality-gate-run-status="running"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect.poll(slowProcessCount).toBeGreaterThan(0)
    await shot(page, '02-running.png')

    // Asking again for a gate that is still running returns the run in progress.
    const runningBefore = slowProcessCount()
    const again = await page.evaluate(
      (worktree) =>
        window.api.runtime.call({
          method: 'qualityGates.run',
          params: { worktree, gateIds: ['slow'] }
        }),
      `id:${workspaceId}`
    )
    expect(again).toMatchObject({
      ok: true,
      result: { runs: [{ started: false, run: { gateId: 'slow', status: 'running' } }] }
    })
    expect(slowProcessCount()).toBe(runningBefore)

    await section.getByRole('button', { name: 'Stop' }).click()
    await expect(
      row(section, 'slow').locator('[data-quality-gate-run-status="cancelled"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect.poll(slowProcessCount).toBe(0)

    // The same gates from a shell, as an agent runs them: by name or id, waiting for the result.
    const selector = `id:${workspaceId}`
    const cli = await runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'run',
      'Lint',
      'tests',
      '--worktree',
      selector,
      '--json'
    ])
    // The failed gate is optional, so the required ones decide: exit 0.
    expect(cli.code, `${cli.stdout}\n${cli.stderr}`).toBe(0)
    expect(cli.json).toMatchObject({
      ok: true,
      result: {
        outcome: 'passed',
        runs: [
          {
            started: true,
            run: {
              gateId: 'lint',
              status: 'passed',
              exitCode: 0,
              startedBy: { kind: 'local-cli' },
              source: { clean: true },
              freshness: { state: 'current' }
            }
          },
          { run: { gateId: 'tests', status: 'failed', exitCode: 3 }, stderr: 'boom\n' }
        ]
      }
    })
    const text = await runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'status',
      '--worktree',
      selector
    ])
    expect(text.code, text.stderr).toBe(0)
    expect(text.stdout).toMatch(/^passed\tlint\tLint\trequired\texit 0\t/m)
    expect(text.stdout).toMatch(/^failed\ttests\tTests\toptional\texit 3\t/m)
    expect(text.stdout).toMatch(/^cancelled\tslow\tSlow\trequired\t/m)
    // A shell cannot define a gate: there is no such command.
    const define = await runCompiledOrcaCli(session.userDataDir, [
      'gates',
      'add',
      'Deploy',
      '--command',
      'echo deployed',
      '--worktree',
      selector
    ])
    expect(define.code).not.toBe(0)
    await section.getByRole('button', { name: 'Read the results again' }).click()

    await row(section, 'tests').getByRole('button', { name: 'Output' }).click()
    await expect(
      row(section, 'tests').locator('[data-quality-gate-output="stderr"]')
    ).toContainText('boom')
    await row(section, 'lint').getByRole('button', { name: 'Output' }).click()
    const lintOutput = row(section, 'lint').locator('[data-quality-gate-output="stdout"]')
    await expect(lintOutput).toContainText('lint ok')
    // `pwd` printed where the command ran: the root of the chosen workspace.
    const worktreeRoot = ((await lintOutput.textContent()) ?? '').split('\n')[0].trim()
    expect(existsSync(path.join(worktreeRoot, 'README.md'))).toBe(true)
    await expect(row(section, 'lint')).toContainText('Up to date')
    await shot(page, '03-results.png')

    writeFileSync(path.join(worktreeRoot, 'gate-probe.txt'), 'edited after the run\n')
    await section.getByRole('button', { name: 'Read the results again' }).click()
    await expect(row(section, 'lint')).toContainText('Out of date: files changed')
    execFileSync('git', ['-C', worktreeRoot, 'add', '-A'], { stdio: 'pipe' })
    execFileSync('git', ['-C', worktreeRoot, 'commit', '-m', 'after the gates ran'], {
      stdio: 'pipe'
    })
    await section.getByRole('button', { name: 'Read the results again' }).click()
    await expect(row(section, 'lint')).toContainText('Out of date: another commit')
    await shot(page, '04-out-of-date.png')

    const remove = section.getByRole('button', { name: 'Remove Slow' })
    await remove.click()
    await expect(remove).toHaveText('Confirm')
    await remove.click()
    await expect(row(section, 'slow')).toHaveCount(0)

    // Nothing about the gates was written into the repository.
    expect(
      execFileSync('git', ['-C', worktreeRoot, 'status', '--porcelain'], { encoding: 'utf-8' })
    ).toBe('')
    expect(existsSync(path.join(worktreeRoot, 'orca.yaml'))).toBe(false)
    expect(existsSync(path.join(repoPath, 'orca.yaml'))).toBe(false)

    // A folder without git runs its gates too, tied to no commit.
    const folderRepoId = await page.evaluate(async (folderPath) => {
      const result = await window.api.repos.add({ path: folderPath, kind: 'folder' })
      if ('error' in result) {
        throw new Error(result.error)
      }
      const store = window.__store!.getState()
      await store.fetchRepos({ runtimeEnvironmentId: null, throwOnError: true })
      await store.fetchWorktrees(result.repo.id)
      return result.repo.id
    }, folderPath)
    const folderSection = await openRepoSettings(page, folderRepoId)
    await addGate(folderSection, { name: 'Check', command: 'ls; echo folder ok' })
    await folderSection.getByRole('button', { name: 'Run Gates' }).click()
    await expect(
      row(folderSection, 'check').locator('[data-quality-gate-run-status="passed"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect(row(folderSection, 'check')).toContainText('Not tied to a commit')
    await row(folderSection, 'check').getByRole('button', { name: 'Output' }).click()
    await expect(
      row(folderSection, 'check').locator('[data-quality-gate-output="stdout"]')
    ).toContainText('notes.txt')
    await shot(page, '05-folder-without-git.png')

    await session.close(app)
    app = null

    const second = await session.launch()
    app = second.app
    await waitForSessionReady(second.page)
    const restored = await openRepoSettings(second.page, repoId)
    await expect.poll(() => gateOrder(restored)).toEqual(['lint', 'tests'])
    await expect(row(restored, 'lint')).toContainText('Limit 45 s')
    await expect(row(restored, 'lint')).toContainText('pwd; echo lint ok')
    await expect(row(restored, 'tests')).toContainText('Optional')
    // The record of the run outlived the app as well, and is still out of date.
    await expect(
      row(restored, 'lint').locator('[data-quality-gate-run-status="passed"]')
    ).toBeVisible({ timeout: 30_000 })
    await expect(row(restored, 'lint')).toContainText('Out of date: another commit')
    await shot(second.page, '06-after-restart.png')
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
    cleanupTestRepository(repoPath)
    rmSync(folderPath, { recursive: true, force: true })
  }
})
