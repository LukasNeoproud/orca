// A saved Claude conversation for the branching specs, and CDP screenshots of the hidden window.
import { randomUUID } from 'node:crypto'
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'

const REVIEW_REPLY =
  'Review findings:\n\n1. The parser drops trailing commas.\n2. The cache never expires.'

function transcript(sessionId: string, cwd: string): string {
  const base = { sessionId, cwd, isSidechain: false, userType: 'external', version: '2.1.0' }
  const at = (seconds: number): string =>
    new Date(Date.now() - 600_000 + seconds * 1000).toISOString()
  const rows: Record<string, unknown>[] = []
  let parent: string | null = null
  const push = (row: Record<string, unknown>): void => {
    const uuid = randomUUID()
    rows.push({ ...base, ...row, uuid, parentUuid: parent })
    parent = uuid
  }
  const turn = (prompt: string, reply: string, second: number): void => {
    push({ type: 'user', timestamp: at(second), message: { role: 'user', content: prompt } })
    push({
      type: 'assistant',
      timestamp: at(second + 1),
      message: {
        id: `msg_${randomUUID()}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: reply }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 }
      }
    })
  }
  turn('Review the parser and the cache.', REVIEW_REPLY, 0)
  turn('Thanks, anything else?', 'Nothing else stood out.', 10)
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
}

export async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const file = testInfo.outputPath(`${name}.png`)
  writeFileSync(file, Buffer.from(data, 'base64'))
  await testInfo.attach(name, { path: file, contentType: 'image/png' })
}

/** Writes a two-turn review conversation where Claude looks for it; returns its id. */
export async function seedReviewConversation(
  electronApp: ElectronApplication,
  repoPath: string
): Promise<string> {
  const home = await electronApp.evaluate(({ app }) => app.getPath('home'))
  const cwd = realpathSync.native(repoPath)
  const projectDir = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(projectDir, { recursive: true })
  const sessionId = randomUUID()
  writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), transcript(sessionId, cwd))
  return sessionId
}
