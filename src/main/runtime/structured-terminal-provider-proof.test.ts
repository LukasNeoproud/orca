import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import {
  selectStructuredTerminalProviderSession,
  resolveStructuredTerminalTranscript
} from './structured-terminal-provider-proof'

const THREAD = '019fd532-7c11-7a90-b6de-4e1a2c3d5f60'
const row = (overrides: Partial<AgentStatusIpcPayload> = {}): AgentStatusIpcPayload => ({
  paneKey: 'pane',
  connectionId: null,
  receivedAt: 2000,
  stateStartedAt: 2000,
  state: 'done',
  prompt: 'existing question',
  agentType: 'codex',
  providerSession: { key: 'session_id', id: THREAD },
  ...overrides
})
const select = (rows: AgentStatusIpcPayload[], launchToken: string | null = null) =>
  selectStructuredTerminalProviderSession({
    paneKey: 'pane',
    incarnationId: 'incarnation',
    agent: 'codex',
    providerSessionId: THREAD,
    launchToken,
    processStartTimeMs: 1000,
    rows
  })
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('terminal provider identity evidence', () => {
  it('accepts a current manually started agent with no Orca launch token', () => {
    expect(select([row()])).toEqual({ key: 'session_id', id: THREAD })
  })

  it.each([
    { receivedAt: 999 },
    { receivedAt: 5000, evidenceObservedAt: 999 },
    { restoredUnconfirmed: true },
    { connectionId: 'remote' },
    { paneKey: 'different-pane' },
    {
      observation: {
        origin: 'title',
        authorityId: 'title',
        incarnation: 1,
        revision: 1,
        observedAt: 2000
      }
    }
  ] satisfies Partial<AgentStatusIpcPayload>[])(
    'refuses stale, remote or inferred evidence %j',
    (patch) => {
      expect(() => select([row(patch)])).toThrow('has not proved this conversation')
    }
  )

  it('accepts a fresh identity-only hook before a resumed turn finishes', () => {
    expect(select([row({ providerSessionOnly: true })]).id).toBe(THREAD)
  })

  it('uses the latest actual provider identity instead of selecting a convenient older match', () => {
    expect(() =>
      select([
        row(),
        row({ receivedAt: 3000, providerSession: { key: 'session_id', id: 'other' } })
      ])
    ).toThrow()
  })

  it('requires a pinned Orca launch token to match the observation', () => {
    expect(() => select([row({ launchToken: 'other' })], 'expected')).toThrow()
    expect(select([row({ launchToken: 'expected' })], 'expected').id).toBe(THREAD)
  })
})

describe('pinned terminal transcript proof', () => {
  async function rollout() {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'orca-adopted-transcript-')))
    roots.push(root)
    const dir = join(root, 'sessions', '2026', '09', '10')
    await mkdir(dir, { recursive: true })
    const file = join(dir, `rollout-2026-09-10T10-00-00-${THREAD}.jsonl`)
    await writeFile(file, `${JSON.stringify({ type: 'session_meta', payload: { id: THREAD } })}\n`)
    return { root, file }
  }

  it('refuses ambiguous account copies until the provider reports its exact file', async () => {
    const one = await rollout()
    const two = await rollout()
    const providerSession = row().providerSession!
    await expect(
      resolveStructuredTerminalTranscript({
        agent: 'codex',
        providerSession,
        candidateAccountHomes: [one.root, two.root]
      })
    ).rejects.toThrow('one readable account transcript')
    await expect(
      resolveStructuredTerminalTranscript({
        agent: 'codex',
        providerSession: { ...providerSession, transcriptPath: one.file },
        candidateAccountHomes: [one.root, two.root]
      })
    ).resolves.toEqual({ accountHomePath: one.root, transcriptPath: one.file, leafUuid: null })
  })

  it('refuses a readable file whose session metadata names another conversation', async () => {
    const one = await rollout()
    await writeFile(
      one.file,
      `${JSON.stringify({ type: 'session_meta', payload: { id: 'other' } })}\n`
    )
    await expect(
      resolveStructuredTerminalTranscript({
        agent: 'codex',
        providerSession: row().providerSession!,
        candidateAccountHomes: [one.root]
      })
    ).rejects.toThrow('one readable account transcript')
  })
})
