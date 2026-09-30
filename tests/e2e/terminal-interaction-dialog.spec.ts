import { join } from 'node:path'
import { once } from 'node:events'
import { test, expect } from './helpers/orca-app'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { spawnProcess } from '../../src/shared/child-process/run-process'

test('terminal MCP paginates ten forms and returns submitted and cancelled tool results', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  test.setTimeout(120_000)
  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const client = new RuntimeClient(userDataPath, 30_000, null, null)
  const worktrees = await client.call<{ worktrees: { id: string }[] }>('worktree.list', {})
  const worktreeId = worktrees.result.worktrees[0]?.id
  expect(worktreeId).toBeTruthy()
  const created = await client.call<{ terminal: { handle: string } }>('terminal.create', {
    worktree: `id:${worktreeId}`,
    title: 'Interactive terminal E2E'
  })
  const handle = created.result.terminal.handle
  let caller: { terminalHandle: string; paneKey: string } | null = null
  await expect
    .poll(
      async () => {
        const { result } = await client.call<{
          terminal: { connected: boolean; tabId: string; leafId: string; incarnationId?: string }
        }>('terminal.show', { terminal: handle })
        if (result.terminal.connected && result.terminal.incarnationId) {
          caller = {
            terminalHandle: handle,
            paneKey: `${result.terminal.tabId}:${result.terminal.leafId}`
          }
          return true
        }
        return false
      },
      { timeout: 30_000 }
    )
    .toBe(true)
  if (!caller) {
    throw new Error('Terminal caller identity unavailable')
  }
  const identity = caller as { terminalHandle: string; paneKey: string }
  const child = spawnProcess({
    program: process.execPath,
    args: [join(process.cwd(), 'out', 'cli', 'index.js'), 'interact', 'mcp'],
    env: {
      ...process.env,
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_USER_DATA_PATH: userDataPath,
      ORCA_TERMINAL_HANDLE: identity.terminalHandle,
      ORCA_PANE_KEY: identity.paneKey,
      ORCA_ENVIRONMENT: '',
      ORCA_PAIRING_CODE: '',
      ORCA_REMOTE_PAIRING: ''
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const responses = new Map<
    number,
    { result?: { tools?: { name: string }[]; structuredContent?: unknown }; error?: unknown }
  >()
  let buffer = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk)
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const message = JSON.parse(buffer.slice(0, newline))
      responses.set(message.id, message)
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  })
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })
  child.on('error', (error) => {
    stderr += error.message
  })
  child.stdin.on('error', (error) => {
    stderr += error.message
  })
  const send = (id: number, method: string, params?: unknown): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  }
  try {
    send(1, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'orca-e2e', version: '1' }
    })
    await expect.poll(() => responses.has(1), { message: stderr }).toBe(true)
    send(2, 'tools/list')
    await expect
      .poll(() => responses.get(2)?.result?.tools?.map((tool) => tool.name))
      .toEqual(['interact'])
    for (let index = 0; index < 10; index += 1) {
      send(100 + index, 'tools/call', {
        name: 'interact',
        arguments: {
          title: `Decision ${index + 1}`,
          fields: [{ id: 'answer', type: 'text', label: 'Your answer', required: true }],
          submitLabel: 'Continue'
        }
      })
      await expect
        .poll(
          async () => (await client.call<unknown[]>('terminalInteraction.pending')).result.length
        )
        .toBe(index + 1)
    }
    const dialog = orcaPage
      .getByRole('dialog')
      .filter({ has: orcaPage.getByRole('heading', { name: 'Decision 1', exact: true }) })
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toContainText('1 / 10')
    await dialog.getByRole('textbox', { name: 'Your answer' }).fill('Keep my first answer')
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled()
    await orcaPage.screenshot({ path: testInfo.outputPath('terminal-interaction-dialog.png') })
    await dialog.getByRole('button', { name: 'Next request' }).click()
    const activeDialog = orcaPage
      .getByRole('dialog')
      .filter({ has: orcaPage.getByRole('textbox', { name: 'Your answer' }) })
    await expect(activeDialog).toContainText('2 / 10')
    await activeDialog
      .getByRole('textbox', { name: 'Your answer' })
      .fill('Independent second answer')
    await activeDialog.getByRole('button', { name: 'Previous request' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
      'Keep my first answer'
    )
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect
      .poll(() => responses.get(100)?.result?.structuredContent, { timeout: 15_000 })
      .toEqual({
        status: 'submitted',
        values: { answer: 'Keep my first answer' }
      })
    await expect(activeDialog).toContainText('1 / 9')
    await expect(activeDialog.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
      'Independent second answer'
    )
    await activeDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect
      .poll(() => responses.get(101)?.result?.structuredContent)
      .toEqual({ status: 'cancelled' })
    for (let index = 2; index < 10; index += 1) {
      await expect(
        activeDialog.getByRole('heading', { name: `Decision ${index + 1}`, exact: true })
      ).toBeVisible()
      await activeDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect
        .poll(() => responses.get(100 + index)?.result?.structuredContent)
        .toEqual({ status: 'cancelled' })
    }
    await expect(activeDialog).toHaveCount(0)
  } finally {
    const exited =
      child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : once(child, 'exit')
    child.stdin.end()
    const timer = setTimeout(() => child.kill(), 5_000)
    try {
      await exited
    } finally {
      clearTimeout(timer)
    }
    await client.call('terminal.close', { terminal: handle }).catch(() => undefined)
  }
})
