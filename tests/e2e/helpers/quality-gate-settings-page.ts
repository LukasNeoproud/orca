import type { Locator, Page } from '@stablyai/playwright-test'
import { expect } from './orca-app'

/** The quality gates section of a repository's settings, scrolled into view. */
export async function openQualityGateSettings(page: Page, repoId: string): Promise<Locator> {
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

export async function addQualityGate(
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

export function qualityGateRow(section: Locator, gateId: string): Locator {
  return section.locator(`[data-quality-gate-row="${gateId}"]`)
}
