import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { afterEach, expect, it } from 'vitest'
import { encodeClaudeProjectPath } from '../ai-vault/claude-project-dir-encoding'
import { forkClaudeConversationInWorker } from './claude-conversation-fork-worker'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const SOURCE = '3f1d2c3b-6f7e-4a6b-9c1d-2e3f4a5b6c7d'
const CWD = '/work/repo'

function row(uuid: string, parentUuid: string | null, type: string, text: string) {
  return JSON.stringify({
    type,
    uuid,
    parentUuid,
    isSidechain: false,
    sessionId: SOURCE,
    cwd: CWD,
    timestamp: '2026-11-09T10:00:00.000Z',
    message: { role: type, content: type === 'user' ? text : [{ type: 'text', text }] }
  })
}

it('forks in the account home the worker is pinned to, up to the boundary, leaving the parent alone', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-fork-worker-'))
  roots.push(root)
  const home = join(root, 'account')
  const projects = join(home, 'projects', encodeClaudeProjectPath(CWD))
  mkdirSync(projects, { recursive: true })
  const parent = [
    row('11111111-1111-4111-8111-111111111111', null, 'user', 'Review'),
    row(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      'assistant',
      'Two findings'
    ),
    row(
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      'user',
      'Fix the first'
    ),
    row(
      '44444444-4444-4444-8444-444444444444',
      '33333333-3333-4333-8333-333333333333',
      'assistant',
      'Fixed'
    )
  ].join('\n')
  writeFileSync(join(projects, `${SOURCE}.jsonl`), `${parent}\n`)
  const entry = join(root, 'claude-conversation-fork-worker-entry.mjs')
  await build({
    entryPoints: [resolve('src/main/claude/claude-conversation-fork-worker-entry.ts')],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
    },
    logLevel: 'silent'
  })

  const child = await forkClaudeConversationInWorker(
    {
      sourceSessionId: SOURCE,
      upToUuid: '22222222-2222-4222-8222-222222222222',
      title: 'Finding 2'
    },
    home,
    entry
  )

  expect(readdirSync(projects).sort()).toEqual([`${child}.jsonl`, `${SOURCE}.jsonl`].sort())
  const forked = readFileSync(join(projects, `${child}.jsonl`), 'utf8')
  expect(forked).toContain('Two findings')
  expect(forked).not.toContain('Fix the first')
  expect(readFileSync(join(projects, `${SOURCE}.jsonl`), 'utf8')).toBe(`${parent}\n`)
  await expect(
    forkClaudeConversationInWorker(
      { sourceSessionId: SOURCE, upToUuid: 'not-in-the-transcript', title: 'x' },
      home,
      entry
    )
  ).rejects.toThrow(/not found/)
}, 60_000)
